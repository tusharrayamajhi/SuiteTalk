"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { SearchInput, Pagination, usePagination } from "@/lib/ui";
import { Plus, Trash } from "@/lib/icons";

interface Staff { id: number; name: string; email: string; role: string; createdAt: string }

export default function StaffPage() {
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hotels/${HOTEL_ID}/staff`);
      if (res.ok) setList(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { fetchStaff(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setError(null); setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/hotels/${HOTEL_ID}/staff`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { setSuccess(`${form.name} added.`); setForm({ name: "", email: "", password: "", role: "STAFF" }); fetchStaff(); }
      else setError(data.error || "Could not create account.");
    } catch { setError("Network error."); }
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this staff member? This is permanent.")) return;
    const res = await fetch(`${API_BASE}/api/staff/${id}`, { method: "DELETE" });
    if (res.ok) fetchStaff();
  };

  const roleChip = (r: string) => r === "OWNER" ? "chip-brass" : r === "MANAGER" ? "chip-green" : "chip-neutral";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.role.toLowerCase().includes(q)
    );
  }, [list, query]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 10);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading staff</p>
    </div>
  );

  return (
    <div className="space-y-7 animate-fadeIn">
      <div>
        <p className="eyebrow">{list.length} team members</p>
        <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Staff &amp; Roles</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Manage who can sign in and what they can see.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add form */}
        <form onSubmit={add} className="card p-6 space-y-4 h-fit">
          <p className="eyebrow">Add a team member</p>
          {error && <div className="chip chip-clay !h-auto !rounded-lg w-full justify-start py-2 px-3">{error}</div>}
          {success && <div className="chip chip-sage !h-auto !rounded-lg w-full justify-start py-2 px-3">{success}</div>}
          <div className="space-y-1.5"><label className="eyebrow text-[10px]">Full name</label>
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-1.5"><label className="eyebrow text-[10px]">Email</label>
            <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div className="space-y-1.5"><label className="eyebrow text-[10px]">Password</label>
            <input className="field" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          <div className="space-y-1.5"><label className="eyebrow text-[10px]">Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="STAFF">Staff — requests &amp; chats</option>
              <option value="MANAGER">Manager — full operations</option>
              <option value="OWNER">Owner — everything</option>
            </select></div>
          <button type="submit" className="btn btn-primary w-full"><Plus size={16} /> Create account</button>
        </form>

        {/* Table */}
        <div className="lg:col-span-2 card overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Active staff</p>
            <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search name, email, role…" className="w-full sm:w-64" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-[var(--color-line)]">
                {["Name", "Email", "Role", "Joined", ""].map((h, i) => <th key={i} className="eyebrow text-[10px] px-5 py-3">{h}</th>)}
              </tr></thead>
              <tbody>
                {pageItems.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-paper-deep)] transition-colors">
                    <td className="px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">{s.name}</td>
                    <td className="px-5 py-4 text-sm text-[var(--color-muted)]">{s.email}</td>
                    <td className="px-5 py-4"><span className={`chip ${roleChip(s.role)}`}>{s.role}</span></td>
                    <td className="px-5 py-4 text-xs text-[var(--color-faint)] tnum">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-right">
                      {s.role !== "OWNER"
                        ? <button onClick={() => remove(s.id)} aria-label="Delete" className="btn btn-ghost btn-sm px-2 text-[var(--color-clay)]"><Trash size={16} /></button>
                        : <span className="eyebrow text-[10px]">Owner</span>}
                    </td>
                  </tr>
                ))}
                {pageItems.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-[var(--color-faint)] italic">No staff match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="staff" />
        </div>
      </div>
    </div>
  );
}
