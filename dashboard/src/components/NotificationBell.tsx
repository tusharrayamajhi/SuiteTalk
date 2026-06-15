"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { Bell, Phone, AudioLines, Check, X } from "@/lib/icons";

interface Notif {
  id: string;
  kind: "request" | "call" | "recording";
  title: string;
  detail: string;
  href: string;
  ts: number;
}

function displayRoom(r: string) { return r.includes("_") ? r.split("_")[1] : r; }

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const SEEN_KEY = "suitetalk_notif_seen";

export function NotificationBell() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Restore the last-seen marker so the unread badge survives reloads.
  useEffect(() => {
    const v = Number(localStorage.getItem(SEEN_KEY) || 0);
    setLastSeen(v);
  }, []);

  // Seed with recent requests so there's history the moment you open the app.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/requests?hotelId=${HOTEL_ID}`);
        if (!res.ok) return;
        const data: any[] = await res.json();
        const seeded: Notif[] = data.slice(0, 12).map((r) => ({
          id: `req-${r.id}`,
          kind: "request",
          title: `New request · Room ${displayRoom(r.roomNumber)}`,
          detail: `${r.requestType}${r.description ? " — " + r.description : ""}`,
          href: "/requests",
          ts: new Date(r.createdAt).getTime(),
        }));
        setNotifs((prev) => merge(prev, seeded));
      } catch { /* ignore */ }
    })();
  }, []);

  useLiveEvents((e) => {
    const now = Date.now();
    if (e.type === "request:new" && e.request) {
      add({
        id: `req-${e.request.id}-${now}`,
        kind: "request",
        title: `New request · Room ${displayRoom(e.request.roomNumber)}`,
        detail: `${e.request.requestType}${e.request.description ? " — " + e.request.description : ""}`,
        href: "/requests",
        ts: now,
      });
    } else if (e.type === "call:start") {
      add({
        id: `call-${e.roomNumber}-${now}`,
        kind: "call",
        title: `Call started · Room ${displayRoom(e.roomNumber)}`,
        detail: `${e.guestName || "Guest"} is speaking with the concierge`,
        href: "/chats",
        ts: now,
      });
    } else if (e.type === "recording:new") {
      add({
        id: `rec-${e.recordingId}`,
        kind: "recording",
        title: `Call recorded · Room ${displayRoom(e.roomNumber)}`,
        detail: "Audio & transcript saved to guest history",
        href: "/history",
        ts: now,
      });
    }
  });

  function add(n: Notif) { setNotifs((prev) => merge(prev, [n])); }

  function merge(a: Notif[], b: Notif[]) {
    const map = new Map<string, Notif>();
    for (const n of [...a, ...b]) map.set(n.id, n);
    return Array.from(map.values()).sort((x, y) => y.ts - x.ts).slice(0, 40);
  }

  // Close on outside click.
  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unread = notifs.filter((n) => n.ts > lastSeen).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      setLastSeen(now);
      localStorage.setItem(SEEN_KEY, String(now));
    }
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const iconFor = (k: Notif["kind"]) =>
    k === "call" ? <Phone size={15} /> : k === "recording" ? <AudioLines size={15} /> : <Bell size={15} />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative btn btn-ghost btn-sm px-2"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-clay)] text-white text-[10px] font-bold flex items-center justify-center tnum">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-h-[440px] card !shadow-[var(--shadow-pop)] z-50 flex flex-col animate-fadeIn overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
            <p className="eyebrow">Notifications</p>
            <div className="flex items-center gap-2">
              {notifs.length > 0 && (
                <button onClick={() => setNotifs([])} className="text-xs text-[var(--color-faint)] hover:text-[var(--color-ink)] inline-flex items-center gap-1">
                  <Check size={12} /> Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-[var(--color-faint)] hover:text-[var(--color-ink)]"><X size={15} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={22} className="mx-auto mb-2 text-[var(--color-line-strong)]" />
                <p className="text-sm text-[var(--color-faint)] italic">You&apos;re all caught up.</p>
              </div>
            ) : (
              notifs.map((n) => {
                const isUnread = n.ts > lastSeen;
                return (
                  <button
                    key={n.id}
                    onClick={() => go(n.href)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[var(--color-line)] last:border-0 hover:bg-[var(--color-paper-deep)] transition-colors ${isUnread ? "bg-[var(--color-primary-soft)]" : ""}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-none ${
                      n.kind === "call" ? "bg-[var(--color-brass-soft)] text-[var(--color-brass)]"
                        : n.kind === "recording" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-ink)]"
                        : "bg-[var(--color-paper-deep)] text-[var(--color-muted)]"
                    }`}>
                      {iconFor(n.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--color-ink)] truncate">{n.title}</span>
                        <span className="text-[10px] text-[var(--color-faint)] flex-none tnum">{timeAgo(n.ts)}</span>
                      </span>
                      <span className="block text-xs text-[var(--color-muted)] truncate mt-0.5">{n.detail}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
