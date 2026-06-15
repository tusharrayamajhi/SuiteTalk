"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { SearchInput, FilterSelect, Pagination, usePagination, formatStayDates, formatDuration } from "@/lib/ui";
import { History, AudioLines, Message, Calendar, Key, Download, Sparkle } from "@/lib/icons";

interface StaySummary {
  id: number; roomNumber: string; guestName: string; roomType: string | null;
  checkIn: string; checkOut: string | null; status: string;
  messageCount: number; recordingCount: number;
}
interface Conversation { id: number; role: string; content: string; toolCalls: any; createdAt: string }
interface Recording { id: number; durationMs: number; startedAt: string; endedAt: string | null }
interface StayDetail extends StaySummary { conversations: Conversation[]; recordings: Recording[] }

function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }

export default function HistoryPage() {
  const [stays, setStays] = useState<StaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchStays = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history/sessions?hotelId=${HOTEL_ID}`);
      if (res.ok) setStays(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { fetchStays(); }, []);

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/sessions/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch (e) { console.error(e); } finally { setDetailLoading(false); }
  };
  useEffect(() => { if (selectedId != null) fetchDetail(selectedId); }, [selectedId]);

  // Live: a finished call may add a recording / transcript to the open stay.
  useLiveEvents((e) => {
    if (e.type === "recording:new" || e.type === "call:end") {
      fetchStays();
      if (selectedId != null) fetchDetail(selectedId);
    }
  });

  const rooms = useMemo(
    () => Array.from(new Set(stays.map((s) => s.roomNumber))).sort(),
    [stays]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stays.filter((s) => {
      if (roomFilter !== "all" && s.roomNumber !== roomFilter) return false;
      if (!q) return true;
      return (
        displayRoom(s.roomNumber).toLowerCase().includes(q) ||
        s.guestName.toLowerCase().includes(q)
      );
    });
  }, [stays, query, roomFilter]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 8);

  if (loading) return <Loading label="Loading guest history" />;

  return (
    <div className="space-y-7 animate-fadeIn">
      <div>
        <p className="eyebrow">Stays · transcripts · call recordings</p>
        <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Guest History</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Step back through every stay — who stayed, what they asked the concierge, and the recorded calls.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ── Stay list ── */}
        <div className="card overflow-hidden">
          <div className="p-4 space-y-3 border-b border-[var(--color-line)]">
            <SearchInput value={query} onChange={setQuery} placeholder="Search room or guest…" />
            <FilterSelect
              value={roomFilter}
              onChange={(v) => { setRoomFilter(v); setPage(1); }}
              label="Filter by room"
              options={[{ value: "all", label: "All rooms" }, ...rooms.map((r) => ({ value: r, label: `Room ${displayRoom(r)}` }))]}
            />
          </div>

          <div className="divide-y divide-[var(--color-line)]">
            {pageItems.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left p-4 hover:bg-[var(--color-paper-deep)] transition-colors ${selectedId === s.id ? "bg-[var(--color-primary-soft)]" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-semibold text-[var(--color-ink)] tnum">Room {displayRoom(s.roomNumber)}</span>
                  <span className={`chip ${s.status === "active" ? "chip-green" : "chip-neutral"}`}>{s.status === "active" ? "In-house" : "Past"}</span>
                </div>
                <p className="text-sm font-medium text-[var(--color-ink)] mt-0.5 truncate">{s.guestName}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--color-faint)]">
                  <span className="inline-flex items-center gap-1"><Calendar size={12} /> {formatStayDates(s.checkIn, s.checkOut)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-1"><Message size={12} /> {s.messageCount} msgs</span>
                  <span className="inline-flex items-center gap-1"><AudioLines size={12} /> {s.recordingCount} {s.recordingCount === 1 ? "call" : "calls"}</span>
                </div>
              </button>
            ))}
            {pageItems.length === 0 && (
              <div className="p-10 text-center text-sm text-[var(--color-faint)] italic">No stays match your search.</div>
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="stays" />
        </div>

        {/* ── Detail ── */}
        <div className="lg:sticky lg:top-24">
          {selectedId == null ? (
            <div className="card p-14 text-center">
              <History size={26} className="mx-auto mb-3 text-[var(--color-line-strong)]" />
              <p className="text-sm text-[var(--color-faint)] italic">Select a stay to see its transcript and recordings.</p>
            </div>
          ) : detailLoading || !detail ? (
            <Loading label="Loading stay" inline />
          ) : (
            <StayDetailView detail={detail} />
          )}
        </div>
      </div>
    </div>
  );
}

function StayDetailView({ detail }: { detail: StayDetail }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Key size={16} className="text-[var(--color-brass)]" />
              <span className="font-display text-2xl font-semibold text-[var(--color-ink)] tnum">Room {displayRoom(detail.roomNumber)}</span>
              {detail.roomType && <span className="eyebrow text-[10px]">{detail.roomType}</span>}
            </div>
            <p className="text-base font-medium text-[var(--color-ink)] mt-1">{detail.guestName}</p>
            <p className="text-sm text-[var(--color-muted)] mt-0.5 inline-flex items-center gap-1.5">
              <Calendar size={13} /> {formatStayDates(detail.checkIn, detail.checkOut)}
            </p>
          </div>
          <span className={`chip ${detail.status === "active" ? "chip-green" : "chip-neutral"}`}>
            {detail.status === "active" ? "Currently in-house" : "Checked out"}
          </span>
        </div>
      </div>

      {/* Recordings */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <AudioLines size={16} className="text-[var(--color-primary)]" />
          <p className="eyebrow">Call recordings ({detail.recordings.length})</p>
        </div>
        {detail.recordings.length === 0 ? (
          <p className="text-sm text-[var(--color-faint)] italic">No call audio recorded for this stay yet.</p>
        ) : (
          <div className="space-y-4">
            {detail.recordings.map((rec, i) => (
              <div key={rec.id} className="border border-[var(--color-line)] rounded-xl p-4 bg-[var(--color-paper)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ink)]">Call {i + 1}</p>
                    <p className="text-xs text-[var(--color-faint)] mt-0.5">
                      {new Date(rec.startedAt).toLocaleString()} · {formatDuration(rec.durationMs)}
                    </p>
                  </div>
                  <a
                    href={`${API_BASE}/api/recordings/${rec.id}/audio`}
                    download={`room-${displayRoom(detail.roomNumber)}-call-${i + 1}.wav`}
                    className="btn btn-ghost btn-sm px-2"
                    aria-label="Download recording"
                  >
                    <Download size={16} />
                  </a>
                </div>
                <audio controls preload="none" className="w-full h-10" src={`${API_BASE}/api/recordings/${rec.id}/audio`}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transcript */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--color-line)]">
          <Message size={16} className="text-[var(--color-primary)]" />
          <p className="eyebrow">Conversation transcript ({detail.conversations.length})</p>
        </div>
        <div className="p-6 space-y-3 max-h-[520px] overflow-y-auto bg-[var(--color-paper)]">
          {detail.conversations.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-faint)] italic py-10">No messages were exchanged during this stay.</p>
          ) : (
            detail.conversations.map((c) => (
              <div key={c.id} className={`flex ${c.role === "ai" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[78%] rounded-xl px-4 py-2.5 text-sm ${
                  c.role === "ai"
                    ? "bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] rounded-bl-sm"
                    : "bg-[var(--color-primary)] text-white rounded-br-sm"
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className={`eyebrow text-[9px] ${c.role === "ai" ? "text-[var(--color-brass)]" : "text-white/70"}`}>
                      {c.role === "ai" ? "Concierge" : "Guest"}
                    </span>
                    <span className={`text-[9px] tnum ${c.role === "ai" ? "text-[var(--color-faint)]" : "text-white/60"}`}>
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {c.content}
                  {Array.isArray(c.toolCalls) && c.toolCalls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.toolCalls.map((t: any, idx: number) => (
                        <span key={idx} className={`chip ${c.role === "ai" ? "chip-brass" : "!bg-white/15 !text-white !border-white/20"}`}>
                          <Sparkle size={11} /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Loading({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${inline ? "card p-14" : "min-h-[50vh]"}`}>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">{label}</p>
    </div>
  );
}
