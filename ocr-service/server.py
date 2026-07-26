import os
import json
import tempfile
import urllib.request
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Disable online connectivity checks to speed up startup
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

# Lock to ensure thread-safe initialization of the OCR instance
ocr_lock = threading.Lock()
ocr_instance = None

def get_ocr_instance(blocking=True):
    global ocr_instance
    if ocr_instance is not None:
        return ocr_instance
    if not blocking:
        if ocr_lock.locked():
            return None
    with ocr_lock:
        if ocr_instance is None:
            print("Initializing PaddleOCR engine (PP-OCRv4, CPU, single-thread)...")
            from paddleocr import PaddleOCR
            ocr_instance = PaddleOCR(
                ocr_version='PP-OCRv4',
                lang='en',
                use_angle_cls=False,
                cpu_threads=1
            )
            print("PaddleOCR engine initialized successfully.")
        return ocr_instance

def warm_up_ocr():
    print("Background thread: Warming up PaddleOCR...")
    try:
        get_ocr_instance(blocking=True)
        print("Background thread: PaddleOCR warm-up complete.")
    except Exception as e:
        print(f"Background thread: Error during PaddleOCR warm-up: {e}")

# Start warm-up in a background thread when the script runs to prevent port-binding delay
threading.Thread(target=warm_up_ocr, daemon=True).start()

class OCRRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence standard HTTP logging to keep console clean, or log explicitly
        print(f"[OCR-Server] {self.address_string()} - - [{self.log_date_time_string()}] {format % args}")

    def do_GET(self):
        # Respond with 200 OK for health check pings
        self.send_json_response(200, {"status": "healthy"})

    def do_HEAD(self):
        # Respond with 200 OK for HEAD health checks
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

    def do_POST(self):
        parsed_url = urlparse(self.path)
        
        if parsed_url.path != '/ocr':
            self.send_error_response(404, "Not Found. Use POST /ocr.")
            return

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self.send_error_response(400, "Empty request body")
            return

        try:
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
        except Exception as e:
            self.send_error_response(400, f"Invalid JSON body: {str(e)}")
            return

        image_url = data.get('url')
        if not image_url:
            self.send_error_response(400, "Missing 'url' parameter in JSON payload")
            return

        temp_file_path = None
        try:
            # 1. Download image from Cloudinary URL to a temp file
            suffix = os.path.splitext(urlparse(image_url).path)[1] or '.jpg'
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file_path = temp_file.name
                
            import ssl
            ssl_context = ssl._create_unverified_context()
            print(f"Downloading image for OCR: {image_url}")
            # Add user-agent header to avoid simple bot blocks
            req = urllib.request.Request(
                image_url, 
                headers={'User-Agent': 'Mozilla/5.0 (ReconFlow OCR Service)'}
            )
            with urllib.request.urlopen(req, context=ssl_context) as response, open(temp_file_path, 'wb') as out_file:
                out_file.write(response.read())

            # 2. Run PaddleOCR
            ocr = get_ocr_instance(blocking=False)
            if ocr is None:
                self.send_error_response(503, "OCR engine is currently warming up in the background. Please retry in a few seconds.")
                return
            print(f"Running PaddleOCR on file: {temp_file_path}")
            result = ocr.ocr(temp_file_path)

            # 3. Format response parameters
            text_lines = []
            words_list = []
            total_confidence = 0.0
            words_count = 0

            # PaddleOCR returns a list of page dicts in the new version
            if result and len(result) > 0:
                for page in result:
                    if not isinstance(page, dict):
                        continue
                    texts = page.get('rec_texts', [])
                    scores = page.get('rec_scores', [])
                    boxes = page.get('rec_polys') or page.get('rec_boxes') or []

                    for idx, text in enumerate(texts):
                        conf = float(scores[idx]) if idx < len(scores) else 1.0
                        
                        # Extract box/polygon coordinates safely
                        box = []
                        if idx < len(boxes):
                            item = boxes[idx]
                            if hasattr(item, 'tolist'):
                                box = item.tolist()
                            elif isinstance(item, (list, tuple)):
                                box = list(item)

                        text_lines.append(text)
                        words_list.append({
                            "text": text,
                            "confidence": conf,
                            "box": box
                        })
                        total_confidence += conf
                        words_count += 1

            # Convert confidence average to a percentage out of 100.0 (e.g. 95.5)
            avg_confidence = (total_confidence / words_count) if words_count > 0 else 0.0
            if avg_confidence <= 1.0 and words_count > 0:
                avg_confidence = avg_confidence * 100.0

            raw_text = "\n".join(text_lines)

            # 4. Return OCR outputs
            response_data = {
                "text": raw_text,
                "confidence": round(avg_confidence, 2),
                "words": words_list
            }

            self.send_json_response(200, response_data)

        except Exception as e:
            print(f"Error during OCR execution: {e}")
            self.send_error_response(500, f"OCR processing failed: {str(e)}")

        finally:
            # Clean up temp file
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception as cleanup_err:
                    print(f"Failed to delete temp file {temp_file_path}: {cleanup_err}")

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_response(self, status_code, message):
        self.send_json_response(status_code, {"error": message})

    def do_OPTIONS(self):
        # Handle CORS preflight request gracefully
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run(host='0.0.0.0', port=3002):
    server_address = (host, port)
    httpd = HTTPServer(server_address, OCRRequestHandler)
    print(f"=================================================")
    print(f" PaddleOCR Microservice running on http://{host}:{port} ")
    print(f"=================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping OCR server...")
        httpd.server_close()

if __name__ == '__main__':
    # Parse port from environment variable if defined
    host_env = os.environ.get('HOST', '0.0.0.0')
    port_env = int(os.environ.get('PORT', 3002))
    run(host=host_env, port=port_env)
