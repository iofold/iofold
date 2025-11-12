import type { SSEEvent } from '../types/api';

export class SSEStream {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController | null = null;
  private keepAliveInterval: number | null = null;

  constructor(private keepAliveIntervalMs: number = 30000) {}

  createStream(): ReadableStream {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;

        // Start keep-alive heartbeat
        this.keepAliveInterval = setInterval(() => {
          this.sendHeartbeat();
        }, this.keepAliveIntervalMs) as any;
      },
      cancel: () => {
        this.close();
      }
    });
  }

  sendEvent(event: SSEEvent) {
    if (!this.controller) return;

    let message = '';

    if (event.type === 'heartbeat') {
      message = ': heartbeat\n\n';
    } else {
      message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    }

    try {
      this.controller.enqueue(this.encoder.encode(message));
    } catch (error) {
      console.error('Failed to send SSE event:', error);
    }
  }

  sendProgress(data: any) {
    this.sendEvent({ type: 'progress', data });
  }

  sendCompleted(result: any) {
    this.sendEvent({ type: 'completed', data: { status: 'completed', result } });
  }

  sendFailed(error: string, details?: string) {
    this.sendEvent({ type: 'failed', data: { status: 'failed', error, details } });
  }

  private sendHeartbeat() {
    this.sendEvent({ type: 'heartbeat' });
  }

  close() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    if (this.controller) {
      try {
        this.controller.close();
      } catch (error) {
        // Controller may already be closed
      }
      this.controller = null;
    }
  }
}

export function createSSEResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
