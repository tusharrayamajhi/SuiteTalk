"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { SearchInput, FilterSelect, Pagination, usePagination } from "@/lib/ui";
import { Plus, Trash, Book } from "@/lib/icons";

interface KBEntry { id: number; content: string; category: string }

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("faq");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const fetchKB = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge-base?hotelId=${HOTEL_ID}`);
      if (res.ok) setEntries(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  useEffect(() => { fetchKB(); }, []);

  const add = async () => {
    if (!content.trim()) return;
    const res = await fetch(`${API_BASE}/api/knowledge-base`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, category, hotelId: HOTEL_ID }),
    });
    if (res.ok) { setContent(""); fetchKB(); }
  };
  const remove = async (id: number) => {
    const res = await fetch(`${API_BASE}/api/knowledge-base/${id}`, { method: "DELETE" });
    if (res.ok) fetchKB();
  };

  const chipFor = (c: string) => c === "policy" ? "chip-clay" : c === "local" ? "chip-sage" : "chip-green";

  const categories = useMemo(
    () => Array.from(new Set(entries.map((e) => e.category).filter(Boolean))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (!q) return true;
      return e.content.toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q);
    });
  }, [entries, query, catFilter]);

  const { page, setPage, totalPages, pageItems, start, end, total } = usePagination(filtered, 8);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading knowledge base</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-7 animate-fadeIn">
      <div>
        <p className="eyebrow">What the AI knows · {entries.length} entries</p>
        <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Knowledge Base</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Facts and policies the concierge draws on during guest calls.</p>
      </div>

      <div className="card p-5 space-y-4">
        <textarea className="field" rows={3}
          placeholder="e.g. Breakfast is served 7–10:30am in the main hall on the ground floor."
          value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <select className="field !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="faq">FAQ</option>
            <option value="policy">Policy</option>
            <option value="local">Local info</option>
          </select>
          <button onClick={add} className="btn btn-primary"><Plus size={16} /> Add to knowledge</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search knowledge…" className="flex-1 min-w-[200px]" />
        <FilterSelect value={catFilter} onChange={(v) => { setCatFilter(v); setPage(1); }} label="Category"
          options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
      </div>

      <div className="space-y-3">
        {pageItems.map((e) => (
          <div key={e.id} className="card p-5 flex items-start justify-between gap-4 group">
            <div className="space-y-2">
              <span className={`chip ${chipFor(e.category)}`}>{e.category}</span>
              <p className="text-sm text-[var(--color-ink)] leading-relaxed">{e.content}</p>
            </div>
            <button onClick={() => remove(e.id)} aria-label="Delete entry"
              className="btn btn-ghost btn-sm px-2 opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--color-clay)]">
              <Trash size={16} />
            </button>
          </div>
        ))}
        {pageItems.length === 0 && (
          <div className="card p-12 text-center text-[var(--color-faint)]">
            <Book size={24} className="mx-auto mb-3 text-[var(--color-line-strong)]" />
            <p className="text-sm italic">{entries.length === 0 ? "No entries yet — teach the concierge something about the hotel." : "No entries match your search."}</p>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPage={setPage} start={start} end={end} total={total} noun="entries" />
    </div>
  );
}
