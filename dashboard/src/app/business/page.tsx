"use client";

import { useEffect, useState } from "react";
import { Building, Server } from "@/lib/icons";

interface Hotel { id: number; name: string; slug: string; createdAt: string }

export default function BusinessPage() {
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = localStorage.getItem("current_hotel");
    if (h) setHotel(JSON.parse(h));
    setLoading(false);
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading profile</p>
    </div>
  );

  const rows = [
    { label: "Property name", value: hotel?.name || "—" },
    { label: "URL slug", value: hotel ? `/${hotel.slug}` : "—" },
    { label: "Hotel ID", value: hotel ? `#${String(hotel.id).padStart(3, "0")}` : "—" },
    { label: "Created", value: hotel ? new Date(hotel.createdAt).toLocaleDateString() : "—" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-7 animate-fadeIn">
      <div>
        <p className="eyebrow">Your property</p>
        <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Hotel Profile</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Property details and AI concierge deployment.</p>
      </div>

      <div className="card p-7">
        <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[var(--color-line)]">
          <div className="w-11 h-11 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center"><Building size={20} /></div>
          <div>
            <p className="display text-xl font-semibold text-[var(--color-ink)]">{hotel?.name || "Hotel"}</p>
            <p className="eyebrow text-[10px]">Single-property deployment</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="eyebrow text-[10px]">{r.label}</dt>
              <dd className="text-lg font-medium text-[var(--color-ink)] mt-1 tnum">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-brass-soft)] text-[var(--color-brass)] flex items-center justify-center shrink-0"><Server size={18} /></div>
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">Runs on your own hardware</p>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed mt-1">
            Rooms, guest profiles, live calls, knowledge base, and AI settings all live in your local database, served by your own backend and Asterisk PBX — nothing leaves the property except the voice link to the AI model.
          </p>
        </div>
      </div>
    </div>
  );
}
