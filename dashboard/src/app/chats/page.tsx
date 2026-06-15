"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { SearchInput, Pagination, usePagination } from "@/lib/ui";
import { Phone } from "@/lib/icons";

interface Conversation { id: number; role: string; content: string; createdAt: string }
interface Session { id: number; roomNumber: string; guestName: string; conversations: Conversation[] }
function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }

export default function ChatsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sessions?hotelId=${HOTEL_ID}`);
      if (res.ok) setSessions(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); const i = setInterval(fetchSessions, 5000); return () => clearInterval(i); }, []);
  useLiveEvents((e) => { if (e.type === "call:start" || e.type === "call:end" || e.type === "request:new") fetchSessions(); });

  const takeover = async (roomNumber: string) => {
    const ext = prompt("Enter your staff extension (e.g. 1001):");
    if (!ext) return;
    try {
      const res = await fetch(`${API_BASE}/api/calls/${roomNumber}/takeover`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffExtension: ext }),
      });
      alert(res.ok ? `Connecting extension ${ext} to Room ${displayRoom(roomNumber)}…` : "Takeover failed.");
    } catch { alert("Takeover network error."); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      displayRoom(s.roomNumber).toLowerCase().includes(q) || s.guestName.toLowerCase().includes(q)
    );
  }, [sessions, query]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 6);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading conversations</p>
    </div>
  );

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Live transcripts · {sessions.length} in-house</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">AI Conversations</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Watch the concierge talk to guests in real time — and step in when needed.</p>
        </div>
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search room or guest…" className="w-full sm:w-72" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {pageItems.map((s) => (
          <div key={s.id} className="card flex flex-col h-[460px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-line)]">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold text-[var(--color-ink)]">Room {displayRoom(s.roomNumber)}</span>
                <span className="text-sm text-[var(--color-muted)]">· {s.guestName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => takeover(s.roomNumber)} className="btn btn-ghost btn-sm"><Phone size={14} /> Take over</button>
                <span className="chip chip-sage"><span className="dot bg-[var(--color-sage)]" /> Live</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[var(--color-paper)]">
              {s.conversations.length === 0 && (
                <p className="text-center text-sm text-[var(--color-faint)] italic py-12">Waiting for the guest to speak…</p>
              )}
              {s.conversations.map((c) => (
                <div key={c.id} className={`flex ${c.role === "ai" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[78%] rounded-xl px-4 py-2.5 text-sm ${
                    c.role === "ai"
                      ? "bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] rounded-bl-sm"
                      : "bg-[var(--color-primary)] text-white rounded-br-sm"
                  }`}>
                    <p className={`eyebrow text-[9px] mb-1 ${c.role === "ai" ? "text-[var(--color-brass)]" : "text-white/70"}`}>
                      {c.role === "ai" ? "Concierge" : "Guest"}
                    </p>
                    {c.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {pageItems.length === 0 && (
          <div className="xl:col-span-2 card p-14 text-center">
            <p className="text-sm text-[var(--color-faint)] italic">
              {sessions.length === 0 ? "No active stay sessions right now." : "No conversations match your search."}
            </p>
          </div>
        )}
      </div>

      {total > 6 && (
        <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="conversations" />
      )}
    </div>
  );
}
