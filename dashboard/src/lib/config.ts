// Central configuration for this single-hotel deployment.
// One backend, one hotel — no tenant selection.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

// WebSocket base derived from the API base (http->ws, https->wss).
export const WS_BASE = API_BASE.replace(/^http/, "ws");

// This deployment serves exactly one hotel.
export const HOTEL_ID = 1;

// SIP / telephony connection details shown on the Device Setup page so a phone,
// softphone, FXS gateway, or existing PBX can register to this system.
// Default is the WSL2 Asterisk IP on this machine; override via env if it changes.
export const SIP_HOST = process.env.NEXT_PUBLIC_SIP_HOST || "172.18.113.51";
export const SIP_PORT = process.env.NEXT_PUBLIC_SIP_PORT || "5060";
export const AI_EXTENSION = "0"; // guests dial this to reach the AI concierge
