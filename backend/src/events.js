import { EventEmitter } from 'node:events';
const bus = new EventEmitter();
bus.setMaxListeners(100);
const CHANNEL = 'live';
export function emitLive(event) {
    bus.emit(CHANNEL, event);
}
export function onLive(listener) {
    bus.on(CHANNEL, listener);
    return () => bus.off(CHANNEL, listener);
}
//# sourceMappingURL=events.js.map