"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { SearchInput, FilterSelect, Pagination, usePagination } from "@/lib/ui";
import { Refresh, Filter } from "@/lib/icons";

interface Request {
  id: number; roomNumber: string; requestType: string;
  description: string; urgency: string; status: string; createdAt: string;
}

function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }
function categoryOf(t: string) { return t.includes(":") ? t.split(":")[0].trim() : t; }

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/requests?hotelId=${HOTEL_ID}`);
      if (res.ok) setRequests(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRequests();
    const i = setInterval(fetchRequests, 20000);
    return () => clearInterval(i);
  }, []);

  useLiveEvents((e) => { if (e.type === "request:new" || e.type === "request:update") fetchRequests(); });

  const updateStatus = async (id: number, s: string) => {
    await fetch(`${API_BASE}/api/requests/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }),
    });
    fetchRequests();
  };

  const rooms = useMemo(() => Array.from(new Set(requests.map((r) => r.roomNumber))).sort(), [requests]);
  const categories = useMemo(() => Array.from(new Set(requests.map((r) => categoryOf(r.requestType)))).sort(), [requests]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (room !== "all" && r.roomNumber !== room) return false;
      if (category !== "all" && categoryOf(r.requestType) !== category) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        displayRoom(r.roomNumber).toLowerCase().includes(q) ||
        r.requestType.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [requests, query, room, category, status]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 10);

  if (loading) return <Loading />;

  const pending = requests.filter((r) => r.status !== "completed").length;
  const hasFilters = query || room !== "all" || category !== "all" || status !== "all";

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Service Queue · {pending} open</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Requests</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Everything guests asked the AI concierge to arrange.</p>
        </div>
        <button onClick={fetchRequests} className="btn btn-secondary"><Refresh size={16} /> Refresh</button>
      </div>

      {/* Filter bar */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search room, service, or description…" className="flex-1 min-w-[220px]" />
        <FilterSelect value={room} onChange={(v) => { setRoom(v); setPage(1); }} label="Room"
          options={[{ value: "all", label: "All rooms" }, ...rooms.map((r) => ({ value: r, label: `Room ${displayRoom(r)}` }))]} />
        <FilterSelect value={category} onChange={(v) => { setCategory(v); setPage(1); }} label="Category"
          options={[{ value: "all", label: "All departments" }, ...categories.map((c) => ({ value: c, label: c }))]} />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} label="Status"
          options={[
            { value: "all", label: "Any status" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
          ]} />
        {hasFilters && (
          <button onClick={() => { setQuery(""); setRoom("all"); setCategory("all"); setStatus("all"); }} className="btn btn-ghost btn-sm">
            <Filter size={14} /> Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                {["#", "Room", "Department & Service", "Description", "Urgency", "Status", ""].map((h, i) => (
                  <th key={i} className={`eyebrow text-[10px] px-5 py-3 font-semibold ${i === 6 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((req) => (
                <tr key={req.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-paper-deep)] transition-colors">
                  <td className="px-5 py-4 text-xs text-[var(--color-faint)] tnum">{req.id}</td>
                  <td className="px-5 py-4 font-display text-lg font-semibold text-[var(--color-ink)] tnum">{displayRoom(req.roomNumber)}</td>
                  <td className="px-5 py-4"><span className="chip chip-neutral">{req.requestType}</span></td>
                  <td className="px-5 py-4 text-sm text-[var(--color-muted)] italic max-w-sm">&ldquo;{req.description}&rdquo;</td>
                  <td className="px-5 py-4">
                    <span className={`chip ${req.urgency === "immediate" ? "chip-clay" : req.urgency === "high" ? "chip-ochre" : "chip-neutral"}`}>{req.urgency}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`chip ${req.status === "completed" ? "chip-sage" : req.status === "in_progress" ? "chip-green" : "chip-ochre"}`}>{req.status.replace("_", " ")}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {req.status === "pending" && (
                        <button onClick={() => updateStatus(req.id, "in_progress")} className="btn btn-ghost btn-sm">Start</button>
                      )}
                      {req.status !== "completed" && (
                        <button onClick={() => updateStatus(req.id, "completed")} className="btn btn-secondary btn-sm">Complete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-[var(--color-faint)] italic">
                  {requests.length === 0 ? "No requests yet." : "No requests match your filters."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="requests" />
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading queue</p>
    </div>
  );
}
