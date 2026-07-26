import axios from 'axios';

export interface OcrResult {
  text: string;
  confidence: number;
  provider: string;
  rawJson: string;
}

/**
 * Service to connect to our dedicated Python PaddleOCR microservice.
 * Does not contain any PaddleOCR internals, keeping the stack modular.
 */
export class OcrService {
  private serviceUrl: string;

  constructor() {
    this.serviceUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:3002';
  }

  async processImage(buffer: Buffer, url?: string): Promise<OcrResult> {
    if (!url) {
      throw new Error('PaddleOCR service integration requires a Cloudinary image URL.');
    }

    try {
      console.log(`Requesting PaddleOCR analysis from microservice: ${this.serviceUrl}/ocr`);
      
      const response = await axios.post(
        `${this.serviceUrl}/ocr`,
        { url },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000, // Allow 180 seconds (3 minutes) for service wakeup, download, and OCR inference
        }
      );

      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }

      return {
        text: data.text || '',
        confidence: data.confidence || 0.0,
        provider: 'paddleocr',
        rawJson: JSON.stringify(data),
      };
    } catch (error: any) {
      console.error('OCR microservice communication failure:', error.message || error);
      
      let errorMsg = 'The PaddleOCR microservice is currently offline or unreachable.';
      if (error.response?.data?.error) {
        errorMsg = `PaddleOCR service error: ${error.response.data.error}`;
      } else if (error.code === 'ECONNREFUSED') {
        errorMsg = `Connection refused at ${this.serviceUrl}. Ensure the PaddleOCR Python service is running.`;
      } else if (error.message) {
        errorMsg = `PaddleOCR service connection error: ${error.message}`;
      }
      
      throw new Error(errorMsg);
    }
  }
}
