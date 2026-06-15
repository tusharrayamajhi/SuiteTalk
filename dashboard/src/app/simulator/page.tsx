"use client";

import { useState } from "react";
import AudioSimulator from "./audio_simulator";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { Sparkle } from "@/lib/icons";

interface ChatMessage { role: string; content: string; tools?: any[] }

export default function SimulatorPage() {
  const [mode, setMode] = useState<"text" | "audio">("audio");
  const [roomNumber, setRoomNumber] = useState("101");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!message.trim()) return;
    setLoading(true); setError(null);
    setChat((p) => [...p, { role: "guest", content: message }]);
    try {
      const res = await fetch(`${API_BASE}/api/test-guest-call`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomNumber, message, hotelId: HOTEL_ID }),
      });
      const data = await res.json();
      if (res.ok) { setChat((p) => [...p, { role: "ai", content: data.response, tools: data.tools }]); setMessage(""); }
      else setError(data.error || "Backend error.");
    } catch { setError("Could not reach the backend on port 3001."); }
    finally { setLoading(false); }
  };

  const rooms = [["101", "Tushar"], ["102", "Alice"], ["201", "Bob"], ["301", "Charlie"]];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Test bench</p>
          <h1 className="display text-2xl font-semibold text-[var(--color-ink)] mt-0.5">Guest Simulator</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-lg bg-[var(--color-paper-deep)] border border-[var(--color-line)]">
            {(["audio", "text"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3.5 py-1.5 text-sm font-semibold rounded-md transition ${mode === m ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted)]"}`}>
                {m === "audio" ? "Voice call" : "Text"}
              </button>
            ))}
          </div>
          <select className="field !w-auto !h-9" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)}>
            {rooms.map(([n, g]) => <option key={n} value={n}>Room {n} · {g}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="chip chip-clay !h-auto !rounded-lg w-full justify-start py-2.5 px-3">{error}</div>}

      {mode === "audio" ? <AudioSimulator /> : (
        <div className="card flex flex-col h-[520px] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[var(--color-paper)]">
            {chat.length === 0 && (
              <p className="text-center text-sm text-[var(--color-faint)] italic py-16">Type a message as the guest — e.g. &ldquo;I&rsquo;d like to order breakfast.&rdquo;</p>
            )}
            {chat.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className={`flex ${m.role === "ai" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${m.role === "ai" ? "bg-[var(--color-surface)] border border-[var(--color-line)] rounded-bl-sm" : "bg-[var(--color-primary)] text-white rounded-br-sm"}`}>
                    <p className={`eyebrow text-[9px] mb-1 ${m.role === "ai" ? "text-[var(--color-brass)]" : "text-white/70"}`}>{m.role === "ai" ? "Concierge" : "Guest"}</p>
                    {m.content}
                  </div>
                </div>
                {m.role === "ai" && m.tools && m.tools.length > 0 && m.tools.map((t: any, ti: number) => (
                  <div key={ti} className="ml-1 max-w-[75%] rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-deep)] p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkle size={13} className="text-[var(--color-brass)]" />
                      <span className="font-semibold text-[var(--color-ink)]">{t.name}</span>
                    </div>
                    <pre className="text-[11px] text-[var(--color-muted)] overflow-x-auto font-mono">{JSON.stringify(t.args, null, 2)}</pre>
                  </div>
                ))}
              </div>
            ))}
            {loading && <p className="eyebrow text-[var(--color-brass)] animate-pulse">Concierge is thinking…</p>}
          </div>
          <div className="p-4 border-t border-[var(--color-line)] flex gap-3">
            <input className="field" value={message} onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && send()} placeholder="Message as the guest…" disabled={loading} />
            <button onClick={send} disabled={loading || !message.trim()} className="btn btn-primary">Send</button>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-[var(--color-faint)]">
        After a tool fires, check the <a href="/requests" className="text-[var(--color-primary)] font-semibold">Requests</a> queue — it updates live.
      </p>
    </div>
  );
}
