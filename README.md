# Payment Screenshot & Bank Statement Reconciliation App

A local-first web application designed to automatically reconcile WhatsApp payment screenshots with bank/account statements.

---

## 📁 Project Structure

```
PaymentReconciliation/
├── backend/                  # FastAPI + Python Backend
│   ├── app/
│   │   ├── config.py         # Application settings & environment variables
│   │   ├── database.py       # SQLAlchemy engine & SQLite session management
│   │   ├── main.py           # FastAPI application entrypoint & health check API
│   │   └── models.py         # SQLAlchemy ORM models for transactions
│   ├── requirements.txt      # Python dependencies
│   ├── .env.example          # Sample environment settings for backend
│   └── venv/                 # Virtual environment (auto-created)
├── frontend/                 # React + TypeScript + Vite + Tailwind CSS Frontend
│   ├── src/
│   │   ├── components/       # Header, StatsOverview, TransactionTable, HealthBadge
│   │   ├── services/         # API integration client (Axios)
│   │   ├── App.tsx           # Dashboard layout
│   │   └── main.tsx          # React DOM entrypoint
│   ├── package.json          # Node dependencies
│   └── .env.example          # Sample environment settings for frontend
├── data/
│   ├── payment-screenshots/  # Directory to drop WhatsApp payment screenshots
│   └── account-statements/   # Directory to drop bank/account statements
├── docs/                     # Project documentation directory
├── .gitignore
└── README.md
```

---

## 🚀 Running the Application Locally

### Prerequisites
- **Node.js** (v18 or higher) & **npm**
- **Python** (v3.10 or higher)

---

### Step 1: Start the Backend (FastAPI + SQLite)

Open a terminal window and navigate to the `backend/` directory:

```bash
cd backend
```

Activate the virtual environment (if not already activated):

- **macOS/Linux**:
  ```bash
  source venv/bin/activate
  ```
- **Windows**:
  ```cmd
  venv\Scripts\activate
  ```

Start the FastAPI server using Uvicorn:

```bash
uvicorn app.main:app --reload --port 8000
```

- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check Endpoint**: `http://localhost:8000/api/health`

---

### Step 2: Start the Frontend (React + Vite)

Open a second terminal window and navigate to the `frontend/` directory:

```bash
cd frontend
```

Start the Vite development server:

```bash
npm run dev
```

- **Frontend Dashboard**: `http://localhost:5173`

---

## 📊 Features Implemented (Initial Setup)

- [x] **Clean Folder Architecture**: Dedicated `/frontend`, `/backend`, `/data`, and `/docs` folders.
- [x] **FastAPI Backend**: Configured CORS, SQLite database connection via SQLAlchemy, auto-created tables.
- [x] **Health Check API**: Endpoint `/api/health` returning API status and SQLite connection state.
- [x] **React + TypeScript + Vite + Tailwind CSS**: Responsive, modern dark-mode reconciliation dashboard.
- [x] **Live Health Status Badge**: Real-time status badge connecting frontend to backend health check.
- [x] **Dashboard Stat Overview**: Summary cards for *Total Screenshots*, *Matched*, *Possible Matches*, *Needs Review*, and *Unmatched*.
- [x] **Transaction Table**: Empty table schema configured with columns: *Screenshot*, *Amount*, *Date*, *Beneficiary*, *Reference Number*, *Confidence*, *Status*, and *Actions*.

---

## ⏳ Next Steps

The project structure is ready for the following upcoming phases:
1. **OCR Pipeline**: Implementing optical character recognition for extracting payment details from WhatsApp screenshots in `/data/payment-screenshots`.
2. **Statement Parser**: Parsing CSV/PDF bank statements in `/data/account-statements`.
3. **Reconciliation Engine**: Automated matching algorithm connecting screenshots with bank statement entries.
