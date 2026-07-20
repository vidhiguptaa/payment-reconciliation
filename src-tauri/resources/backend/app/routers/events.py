import asyncio
import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProcessingLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["events-and-logs"])

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast_async(self, event_type: str, data: Dict[str, Any]) -> None:
        payload = json.dumps({"event": event_type, "data": data})
        disconnected: List[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending message to WebSocket client: {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        """
        Thread-safe broadcast helper that can be called from synchronous background watcher threads.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(self.broadcast_async(event_type, data), loop)
            else:
                loop.run_until_complete(self.broadcast_async(event_type, data))
        except Exception:
            # Fallback if no loop in current thread
            new_loop = asyncio.new_event_loop()
            new_loop.run_until_complete(self.broadcast_async(event_type, data))
            new_loop.close()

manager = ConnectionManager()

@router.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection open and handle incoming client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        manager.disconnect(websocket)

@router.get("/logs")
def list_processing_logs(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    logs = (
        db.query(ProcessingLog)
        .order_by(ProcessingLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else "",
            "filename": log.filename,
            "filepath": log.filepath,
            "operation": log.operation,
            "success": log.success,
            "duration_ms": log.duration_ms,
            "error_message": log.error_message,
        }
        for log in logs
    ]
