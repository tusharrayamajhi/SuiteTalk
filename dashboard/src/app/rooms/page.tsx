"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { SearchInput, FilterSelect, Pagination, usePagination } from "@/lib/ui";
import { Plus, Wifi, WifiOff, AudioLines } from "@/lib/icons";

interface Room { roomNumber: string; roomType: string; guestName: string; status: string; online?: boolean }
function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [form, setForm] = useState({ roomNumber: "", guestName: "", checkOutDate: "" });
  const [loading, setLoading] = useState(true);
  const [onCall, setOnCall] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms?hotelId=${HOTEL_ID}`);
      if (res.ok) setRooms(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchRooms(); const i = setInterval(fetchRooms, 20000); return () => clearInterval(i); }, []);

  useLiveEvents((e) => {
    if (e.type === "room:status") setRooms((rs) => rs.map((r) => r.roomNumber === e.roomNumber ? { ...r, online: e.online } : r));
    else if (e.type === "call:start") setOnCall((s) => new Set(s).add(e.roomNumber));
    else if (e.type === "call:end") setOnCall((s) => { const n = new Set(s); n.delete(e.roomNumber); return n; });
  });

  const checkIn = async () => {
    await fetch(`${API_BASE}/api/integration/guest-checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, hotelId: HOTEL_ID }),
    });
    setShowCheckIn(false); fetchRooms();
  };
  const checkOut = async (roomNumber: string) => {
    if (!confirm(`Check out Room ${displayRoom(roomNumber)}?`)) return;
    await fetch(`${API_BASE}/api/integration/guest-checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomNumber, hotelId: HOTEL_ID }),
    });
    fetchRooms();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => {
      if (status === "online" && !r.online) return false;
      if (status === "offline" && r.online) return false;
      if (status !== "all" && status !== "online" && status !== "offline" && r.status !== status) return false;
      if (!q) return true;
      return (
        displayRoom(r.roomNumber).toLowerCase().includes(q) ||
        (r.guestName || "").toLowerCase().includes(q) ||
        (r.roomType || "").toLowerCase().includes(q)
      );
    });
  }, [rooms, query, status]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 12);

  if (loading) return <Loading />;

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{rooms.filter((r) => r.online).length} phones online</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Rooms</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Live phone status, occupancy, and guest check-in.</p>
        </div>
        <button onClick={() => setShowCheckIn((v) => !v)} className="btn btn-primary"><Plus size={16} /> Check in guest</button>
      </div>

      {showCheckIn && (
        <div className="card p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end animate-fadeIn">
          <div className="space-y-1.5">
            <label className="eyebrow text-[10px]">Room number</label>
            <input className="field" placeholder="101" onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow text-[10px]">Guest name</label>
            <input className="field" placeholder="Jane Doe" onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow text-[10px]">Check-out date</label>
            <input className="field" type="date" onChange={(e) => setForm({ ...form, checkOutDate: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={checkIn} className="btn btn-primary flex-1">Check in</button>
            <button onClick={() => setShowCheckIn(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search room, guest, or type…" className="flex-1 min-w-[220px]" />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Status"
          options={[
            { value: "all", label: "All rooms" },
            { value: "occupied", label: "Occupied" },
            { value: "vacant", label: "Vacant" },
            { value: "online", label: "Phone online" },
            { value: "offline", label: "Phone offline" },
          ]} />
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 p-5">
          {pageItems.map((room) => {
            const calling = onCall.has(room.roomNumber);
            return (
              <div key={room.roomNumber} className={`card p-5 flex flex-col ${calling ? "ring-1 ring-[var(--color-sage)]" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="display text-2xl font-semibold text-[var(--color-ink)] tnum">Room {displayRoom(room.roomNumber)}</p>
                    <p className="eyebrow text-[10px] mt-0.5">{room.roomType}</p>
                  </div>
                  <span className={`chip ${room.status === "occupied" ? "chip-green" : room.status === "DND" ? "chip-clay" : "chip-neutral"}`}>{room.status}</span>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${room.online ? "text-[var(--color-sage)]" : "text-[var(--color-faint)]"}`}>
                    {room.online ? <Wifi size={15} /> : <WifiOff size={15} />}
                    {room.online ? "Phone online" : "Phone offline"}
                  </span>
                  {calling && (
                    <span className="chip chip-sage"><AudioLines size={13} /> On call</span>
                  )}
                </div>

                <div className="rule my-4" />
                <p className="eyebrow text-[10px]">Current guest</p>
                <p className={`text-sm mt-1 ${room.guestName ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-faint)] italic"}`}>
                  {room.guestName || "Vacant"}
                </p>

                {room.status === "occupied" && (
                  <button onClick={() => checkOut(room.roomNumber)} className="btn btn-ghost btn-sm mt-4 self-start">Check out</button>
                )}
              </div>
            );
          })}
          {pageItems.length === 0 && (
            <div className="sm:col-span-2 lg:col-span-4 py-14 text-center text-sm text-[var(--color-faint)] italic">No rooms match your search.</div>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="rooms" />
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading rooms</p>
    </div>
  );
}
