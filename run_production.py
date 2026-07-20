#!/usr/bin/env python3
import os
import sys
import socket
import urllib.request
import traceback
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
BACKEND_DIR = BASE_DIR / "backend"

print("==================================================")
print("  Payment Reconciliation Application - Production Mode")
print("==================================================")

# Diagnostic Logging
print("[Backend Diagnostics] Startup Information:")
print(f"  - Python Interpreter Path: {sys.executable}")
print(f"  - Current Working Directory: {os.getcwd()}")
print(f"  - Script Base Directory: {BASE_DIR}")
print(f"  - Backend Module Directory: {BACKEND_DIR}")

# Set production environment
os.environ["APP_ENV"] = os.getenv("APP_ENV", "production")
port = int(os.getenv("PORT", "8000"))
host = os.getenv("HOST", "127.0.0.1")

print("  - Environment Variables:")
print(f"    • APP_ENV: {os.getenv('APP_ENV')}")
print(f"    • PORT: {port}")
print(f"    • HOST: {host}")
print("==================================================\n")

try:
    # 1. Frontend Asset Check (Non-blocking)
    print("[Step 1/4] Checking React frontend distribution...")
    if (FRONTEND_DIST_DIR / "index.html").exists():
        print("  -> Built React frontend distribution found at frontend/dist.")
    else:
        print("  -> Notice: Static distribution frontend/dist/index.html not present. API server will run standalone.")

    # 2. Add backend path to sys.path & verify app module imports
    print("[Step 2/4] Verifying Backend Module Imports...")
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    print("  -> Importing app.config...")
    from app.config import settings
    print(f"     • App Name: {settings.APP_NAME} (v{settings.APP_VERSION})")
    print(f"     • Database URL: {settings.DATABASE_URL}")

    print("  -> Importing app.database...")
    from app.database import engine, Base

    print("  -> Importing app.services.watcher...")
    from app.services.watcher.watcher import watcher_service

    print("  -> Importing app.main (FastAPI Application)...")
    from app.main import app as fastapi_app
    print("  -> FastAPI app imported successfully.")

    # 3. Pre-check Port Availability & Smart Existing Instance Reuse
    print(f"[Step 3/4] Pre-checking socket port availability on {host}:{port}...")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1.0)
    res = sock.connect_ex((host, port))
    sock.close()

    if res == 0:
        print(f"[Notice] Port {port} on {host} is currently bound.")
        # Check if active backend instance is healthy
        try:
            req = urllib.request.urlopen(f"http://{host}:{port}/api/health", timeout=1.5)
            if req.status == 200:
                print(f"[Production Status] Backend instance is already running and healthy on http://{host}:{port} (HTTP 200).")
                sys.exit(0)
        except Exception:
            print(f"[WARNING] Port {port} is occupied by an unresponsive process.")

    print("  -> Port availability pre-check completed.")

    # 4. Launch Uvicorn Production Server
    print(f"[Step 4/4] Launching Uvicorn Server on http://{host}:{port}...")
    import uvicorn

    sys.stdout.flush()
    sys.stderr.flush()

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )

except SystemExit:
    sys.exit(0)
except Exception as e:
    print("\n==================================================")
    print("  CRITICAL ERROR: Backend Server Startup Failed")
    print("==================================================")
    print(f"Exception Type: {type(e).__name__}")
    print(f"Exception Message: {str(e)}")
    print("\nFull Traceback:")
    traceback.print_exc()
    print("==================================================")
    sys.stdout.flush()
    sys.stderr.flush()
    sys.exit(1)
