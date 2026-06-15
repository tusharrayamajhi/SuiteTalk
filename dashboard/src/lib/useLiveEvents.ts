"use client";

import { useEffect, useRef } from "react";
import { WS_BASE } from "./config";

// Mirrors the backend LiveEvent union (backend/src/events.ts).
export type LiveEvent =
  | { type: "request:new"; request: any }
  | { type: "request:update"; request: any }
  | { type: "call:start"; roomNumber: string; guestName?: string; hotelId?: number }
  | { type: "call:end"; roomNumber: string; hotelId?: number }
  | { type: "recording:new"; roomNumber: string; sessionId?: number; recordingId: number; hotelId?: number }
  | { type: "room:status"; roomNumber: string; online: boolean };

/**
 * Subscribe to the backend live event stream (`/api/events`). The handler fires
 * for every event the backend broadcasts (new requests, call start/end, room
 * online/offline). Auto-reconnects if the socket drops.
 */
export function useLiveEvents(onEvent: (event: LiveEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${WS_BASE}/api/events`);
      ws.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data) as LiveEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);
}
