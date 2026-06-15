import { EventEmitter } from 'node:events'

/**
 * Live event bus for the staff dashboard.
 *
 * Emitters (db.ts, audio.ts, index.ts) call `emitLive(...)` without needing a
 * reference to the WebSocket server. index.ts subscribes once and relays every
 * event to all connected dashboard clients on `/api/events`.
 */
export type LiveEvent =
  | { type: 'request:new'; request: any }
  | { type: 'request:update'; request: any }
  | { type: 'call:start'; roomNumber: string; guestName?: string; hotelId?: number }
  | { type: 'call:end'; roomNumber: string; hotelId?: number }
  | { type: 'recording:new'; roomNumber: string; sessionId?: number; recordingId: number; hotelId?: number }
  | { type: 'room:status'; roomNumber: string; online: boolean }

const bus = new EventEmitter()
bus.setMaxListeners(100)

const CHANNEL = 'live'

export function emitLive(event: LiveEvent): void {
  bus.emit(CHANNEL, event)
}

export function onLive(listener: (event: LiveEvent) => void): () => void {
  bus.on(CHANNEL, listener)
  return () => bus.off(CHANNEL, listener)
}
