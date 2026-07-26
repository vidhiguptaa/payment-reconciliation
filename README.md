# ReconFlow: Payment Reconciliation Web Application

ReconFlow is a clean, minimal, and production-ready web application designed to automatically reconcile payment screenshots with bank statements. It uses a modern TypeScript/Node.js stack and delegates OCR operations to a small, dedicated Python PaddleOCR microservice. File uploads are stored entirely in-memory and streamed directly to Cloudinary, ensuring zero dependency on local filesystem persistence.

---

## 📁 Project Structure

```
PaymentReconciliation/
├── shared/                   # Shared TypeScript typings
├── backend/                  # Node.js + Express + TypeScript + Prisma ORM
│   ├── prisma/               # SQLite Database schema & migrations
│   ├── src/                  # Controllers, Routers, and Services
│   └── package.json          # Backend dependencies
├── frontend/                 # React + TypeScript + Vite + Tailwind CSS + React Query
│   ├── src/                  # App components, pages, and API integration client
│   └── package.json          # Frontend dependencies
└── ocr-service/              # Python PaddleOCR Microservice
    ├── server.py             # Minimal HTTP server running PaddleOCR (http.server)
    └── requirements.txt      # Python OCR packages (paddleocr, paddlepaddle)
```

---

## ⚙️ Environment Variables

### Backend Configuration (`backend/.env`)

Create a `backend/.env` file:

```ini
# Server listening port
PORT=3001

# SQLite database file path (relative to backend/prisma/)
DATABASE_URL="file:./reconciliation.db"

# JWT token signature secret
JWT_SECRET="your_jwt_signing_secret_here"

# Default Admin User Credentials (Created automatically on startup if User table is empty)
DEFAULT_ADMIN_EMAIL="admin@example.com"
DEFAULT_ADMIN_PASSWORD="ChangeMe123!"

# Cloudinary Access Credentials
CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

# PaddleOCR Microservice Endpoint URL
OCR_SERVICE_URL="http://localhost:3002"
```

### OCR Service Configuration (Optional, `ocr-service/` environment)
The Python server defaults to listening on `0.0.0.0:3002`. You can customize this by setting standard environment variables:
- `HOST`: Server interface binding (defaults to `0.0.0.0`)
- `PORT`: Server port (defaults to `3002`)

### Frontend Configuration (`frontend/.env`)

Create a `frontend/.env` file:

```ini
# URL targeting the backend Express API server
VITE_API_URL="http://localhost:3001"
```

---

## 🚀 Running the Application Locally

### Step 1: Start the PaddleOCR Python Microservice

1. Navigate to the `ocr-service/` directory:
   ```bash
   cd ocr-service
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the OCR service:
   ```bash
   python server.py
   ```
   * The PaddleOCR models will automatically download on the first OCR request.

### Step 2: Start the Main Node Backend and React Frontend

From the root workspace directory in another terminal window:

1. Install Node workspace dependencies:
   ```bash
   npm install
   ```
2. Initialize and sync the SQLite Prisma database:
   ```bash
   npm --prefix backend run db:push
   ```
3. Start the application:
   ```bash
   # Starts Node backend on :3001 and React Vite dev server on :5173
   npm run dev
   ```

* **Frontend URL**: [http://localhost:5173](http://localhost:5173)
* **Backend Health Check**: [http://localhost:3001/health](http://localhost:3001/health)
* **OCR Microservice API**: [http://localhost:3002/ocr](http://localhost:3002/ocr)

---

## 🔒 Default Credentials
On first database initialization, the server seeds a default administrator account using the `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` defined in `backend/.env`. (Fallback defaults: `admin@example.com` / `ChangeMe123!`).

---

## ☁️ Deployment Guidance

### 1. Database & Storage Strategy
- **SQLite**: On Render, you must configure a **Persistent Disk** mount (e.g. `/data`) and update your production environment `DATABASE_URL` to point to the mounted file (e.g., `file:/data/reconciliation.db`).
- **Cloudinary**: Holds all payment screenshots and Excel/CSV statements. Memory buffers are streamed to Cloudinary, ensuring zero dependency on local persistent disk.

### 2. Python OCR Microservice on Render
1. Create a new **Web Service** on Render.
2. Select **Python** runtime.
3. Build Command: `pip install -r ocr-service/requirements.txt`
4. Start Command: `python ocr-service/server.py`
5. Configure `PORT` environment variable to `3002` (or your preferred port).

### 3. Node Backend on Render
1. Create a **Web Service** pointing to your repository.
2. Select **Node** runtime.
3. Build Command: `npm install && npm run build:backend`
4. Start Command: `npm --prefix backend run start`
5. Mount a **Persistent Disk** at `/data` (e.g. 1GB size).
6. Set environment variables:
   - `DATABASE_URL=file:/data/reconciliation.db`
   - `OCR_SERVICE_URL`: Set to the URL of the Python OCR service deployed on Render.
   - `JWT_SECRET`, `DEFAULT_ADMIN_*`, `CLOUDINARY_*`.

### 4. Frontend on Vercel
1. Import your project into Vercel.
2. Select the **Root Directory** as `frontend/`.
3. Set `VITE_API_URL` to the URL of the Node backend web service deployed on Render.
