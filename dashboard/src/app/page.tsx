"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { Bell, Key, Wifi, Alert, Phone, AudioLines, ArrowRight } from "@/lib/icons";

interface Request {
  id: number; roomNumber: string; requestType: string;
  description: string; urgency: string; status: string; createdAt: string;
}
interface Room { roomNumber: string; status: string; online?: boolean }
interface Hotel { id: number; name: string; slug: string }

function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }

function StatusChip({ status }: { status: string }) {
  const cls = status === "completed" ? "chip-sage" : status === "in_progress" ? "chip-green" : "chip-ochre";
  return <span className={`chip ${cls}`}>{status.replace("_", " ")}</span>;
}
function UrgencyChip({ urgency }: { urgency: string }) {
  const cls = urgency === "immediate" ? "chip-clay" : urgency === "high" ? "chip-ochre" : "chip-neutral";
  return <span className={`chip ${cls}`}>{urgency}</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<any>(null);
  const [activeCalls, setActiveCalls] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = localStorage.getItem("current_staff");
    const h = localStorage.getItem("current_hotel");
    if (!s) { router.replace("/login"); return; }
    if (h) setHotel(JSON.parse(h));
    setAuthChecked(true);
  }, [router]);

  const fetchData = async () => {
    try {
      const [r, rm, st] = await Promise.all([
        fetch(`${API_BASE}/api/requests?hotelId=${HOTEL_ID}`),
        fetch(`${API_BASE}/api/rooms?hotelId=${HOTEL_ID}`),
        fetch(`${API_BASE}/api/settings?hotelId=${HOTEL_ID}`),
      ]);
      setRequests((await r.json()).slice(0, 6));
      setRooms(await rm.json());
      setAgent(await st.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchData();
    const i = setInterval(fetchData, 20000);
    return () => clearInterval(i);
  }, [authChecked]);

  useLiveEvents((e) => {
    if (e.type === "request:new" || e.type === "request:update") fetchData();
    else if (e.type === "call:start") setActiveCalls((c) => ({ ...c, [e.roomNumber]: e.guestName || "Guest" }));
    else if (e.type === "call:end") setActiveCalls((c) => { const n = { ...c }; delete n[e.roomNumber]; return n; });
    else if (e.type === "room:status") setRooms((rs) => rs.map((r) => r.roomNumber === e.roomNumber ? { ...r, online: e.online } : r));
  });

  if (!authChecked || loading) return <Loading />;

  const stats = [
    { label: "Active Requests", value: requests.filter((r) => r.status === "pending").length, hint: "pending", Icon: Bell },
    { label: "Occupied Rooms", value: rooms.filter((r) => r.status === "occupied" || r.status === "DND").length, hint: `of ${rooms.length}`, Icon: Key },
    { label: "Phones Online", value: rooms.filter((r) => r.online).length, hint: "registered", Icon: Wifi },
    { label: "Urgent Tasks", value: requests.filter((r) => r.urgency === "immediate" || r.urgency === "high").length, hint: "to review", Icon: Alert },
  ];
  const calls = Object.entries(activeCalls);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Concierge Overview</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">
            {agent?.agent_name || "SuiteTalk Concierge"}
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1 max-w-xl italic">
            &ldquo;{agent?.ai_tone || "Welcome guests warmly and assist with their requests."}&rdquo;
          </p>
        </div>
        <span className="chip chip-green"><span className="dot bg-[var(--color-sage)]" /> AI active at {hotel?.name || "the hotel"}</span>
      </div>

      {/* Live calls */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Phone size={16} className="text-[var(--color-primary)]" />
          <p className="eyebrow">Calls in progress</p>
        </div>
        {calls.length === 0 ? (
          <p className="text-sm text-[var(--color-faint)]">
            No active calls. When a guest dials from a room, the AI answers and it appears here instantly.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {calls.map(([room, guest]) => (
              <div key={room} className="flex items-center gap-3 border border-[var(--color-line)] rounded-lg px-4 py-2.5 bg-[var(--color-primary-soft)]">
                <AudioLines size={18} className="text-[var(--color-primary)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-primary-ink)]">Room {displayRoom(room)}</p>
                  <p className="eyebrow text-[10px]">{guest} · on call</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-[10px]">{s.label}</p>
              <s.Icon size={16} />
            </div>
            <p className="stat-num text-[40px] mt-3 text-[var(--color-ink)]">{s.value}</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Service queue */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
          <p className="eyebrow">Live Service Queue</p>
          <a href="/requests" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:gap-2.5 transition-all">
            View all <ArrowRight size={15} />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                {["Room", "Department & Service", "Instruction", "Urgency", "Status"].map((h) => (
                  <th key={h} className="eyebrow text-[10px] px-5 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-paper-deep)] transition-colors">
                  <td className="px-5 py-4 font-display text-lg font-semibold text-[var(--color-ink)] tnum">{displayRoom(req.roomNumber)}</td>
                  <td className="px-5 py-4"><span className="chip chip-neutral">{req.requestType}</span></td>
                  <td className="px-5 py-4 text-sm text-[var(--color-muted)] max-w-xs truncate italic">&ldquo;{req.description}&rdquo;</td>
                  <td className="px-5 py-4"><UrgencyChip urgency={req.urgency} /></td>
                  <td className="px-5 py-4"><StatusChip status={req.status} /></td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-[var(--color-faint)] italic">The service queue is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading command center</p>
    </div>
  );
}
