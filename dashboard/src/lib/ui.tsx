"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "./icons";

/** Search box matching the design system's .field style, with an inline icon. */
export function SearchInput({
  value, onChange, placeholder = "Search…", className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] pointer-events-none" />
      <input
        className="field !pl-10 !pr-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/** Dropdown filter that matches the design system's .field style. */
export function FilterSelect({
  value, onChange, options, label,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string }) {
  return (
    <select className="field !w-auto min-w-[9rem]" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * Client-side pagination over an already-filtered array. Automatically clamps
 * the page when the list shrinks (e.g. after a search) so you never land on an
 * empty page.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  const start = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, items.length);

  return { page, setPage, totalPages, pageItems, start, end, total: items.length };
}

/** Pager footer: "Showing X–Y of Z" plus prev/next and numbered buttons. */
export function Pagination({
  page, totalPages, onPage, start, end, total, noun = "items",
}: {
  page: number; totalPages: number; onPage: (p: number) => void;
  start: number; end: number; total: number; noun?: string;
}) {
  if (total === 0) return null;

  // Compact window of page numbers around the current page.
  const nums: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let i = Math.max(1, to - 4); i <= to; i++) nums.push(i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[var(--color-line)]">
      <p className="text-xs text-[var(--color-faint)]">
        Showing <span className="tnum text-[var(--color-muted)] font-semibold">{start}–{end}</span> of{" "}
        <span className="tnum text-[var(--color-muted)] font-semibold">{total}</span> {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1}
            className="btn btn-ghost btn-sm px-2" aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          {nums[0]! > 1 && <span className="px-1 text-xs text-[var(--color-faint)]">…</span>}
          {nums.map((n) => (
            <button key={n} onClick={() => onPage(n)}
              className={`btn btn-sm px-3 ${n === page ? "btn-primary" : "btn-ghost"}`}>
              {n}
            </button>
          ))}
          {nums[nums.length - 1]! < totalPages && <span className="px-1 text-xs text-[var(--color-faint)]">…</span>}
          <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}
            className="btn btn-ghost btn-sm px-2" aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Tiny helper to format a date range for a stay. */
export function formatStayDates(checkIn: string, checkOut: string | null) {
  const ci = new Date(checkIn);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const inStr = ci.toLocaleDateString(undefined, opts);
  if (!checkOut) return `${inStr} → present`;
  const co = new Date(checkOut);
  const sameYear = ci.getFullYear() === co.getFullYear();
  return `${inStr} → ${co.toLocaleDateString(undefined, sameYear ? opts : { ...opts, year: "numeric" })}`;
}

/** Format milliseconds as m:ss. */
export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
