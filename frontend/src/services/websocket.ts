type EventHandler = (event: string, data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private url: string;

  constructor() {
    let host: string;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    if (import.meta.env.VITE_API_BASE_URL !== undefined && import.meta.env.VITE_API_BASE_URL !== '') {
      host = import.meta.env.VITE_API_BASE_URL.replace(/^http/, 'ws');
    } else if (typeof window !== 'undefined') {
      if (window.location.port === '5173') {
        host = `${protocol}//${window.location.hostname}:8000`;
      } else if (window.location.hostname === 'localhost' || window.location.hostname === 'tauri.localhost' || window.location.protocol.startsWith('tauri')) {
        host = 'ws://127.0.0.1:8000';
      } else {
        host = `${protocol}//${window.location.host}`;
      }
    } else {
      host = 'ws://127.0.0.1:8000';
    }

    this.url = `${host}/api/ws/events`;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // Connection opened cleanly
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event) {
            this.handlers.forEach((handler) => handler(payload.event, payload.data));
          }
        } catch {
          // Ignore invalid frames
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }

  public subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsService = new WebSocketService();
