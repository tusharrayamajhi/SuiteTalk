"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE, HOTEL_ID, SIP_HOST, SIP_PORT, AI_EXTENSION } from "@/lib/config";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { Server, Database, Antenna, Phone, AudioLines, Copy, Check, ArrowRight } from "@/lib/icons";

interface SystemStatus {
  database: { connected: boolean; roomsCount: number; sessionsCount: number; kbCount: number; error: string | null };
  asterisk: { connected: boolean; loggedIn: boolean; error: string | null; registeredPeers: string[] };
  uptime: number;
}

type StageKey = "api" | "db" | "pbx" | "phone" | "ai";
interface Stage { key: StageKey; label: string; desc: string; Icon: React.ComponentType<{ size?: number; className?: string }>; done: boolean; detail: string }

function fmtUptime(s?: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  if (m < 60) return `${m}m ${sec}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function SetupGuidePage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedOk, setSeedOk] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [activeCalls, setActiveCalls] = useState<string[]>([]);
  const [mock101, setMock101] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/setup/status?hotelId=${HOTEL_ID}`);
      if (res.ok) {
        const d: SystemStatus = await res.json();
        setStatus(d);
        const p = d.asterisk?.registeredPeers || [];
        setPeers(p);
        setMock101(p.includes("101"));
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); const i = setInterval(fetchStatus, 5000); return () => clearInterval(i); }, [fetchStatus]);

  useLiveEvents((e) => {
    if (e.type === "room:status") {
      setPeers((prev) => { const s = new Set(prev); e.online ? s.add(e.roomNumber) : s.delete(e.roomNumber); return Array.from(s); });
      if (e.roomNumber === "101") setMock101(e.online);
    } else if (e.type === "call:start") setActiveCalls((p) => p.includes(e.roomNumber) ? p : [...p, e.roomNumber]);
    else if (e.type === "call:end") setActiveCalls((p) => p.filter((r) => r !== e.roomNumber));
  });

  const seed = async () => {
    setSeeding(true); setSeedOk(false);
    try {
      const res = await fetch(`${API_BASE}/api/setup/seed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotelId: HOTEL_ID }) });
      if (res.ok) { setSeedOk(true); fetchStatus(); setTimeout(() => setSeedOk(false), 5000); }
    } catch (e) { console.error(e); } finally { setSeeding(false); }
  };
  const toggleMock = async () => {
    const next = !mock101; setMock101(next);
    try { await fetch(`${API_BASE}/api/setup/mock-peer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: "101", registered: next }) }); }
    catch (e) { console.error(e); }
  };
  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500); };

  const backendOnline = status !== null;
  const dbConnected = !!status?.database?.connected;
  const pbxConnected = !!status?.asterisk?.loggedIn;
  const phoneRegistered = peers.length > 0;
  const aiReady = backendOnline && dbConnected && pbxConnected && phoneRegistered;

  const stages: Stage[] = [
    { key: "api", label: "Backend", desc: "SuiteTalk server", Icon: Server, done: backendOnline, detail: backendOnline ? `up ${fmtUptime(status?.uptime)}` : "starting" },
    { key: "db", label: "Database", desc: "Postgres + vectors", Icon: Database, done: dbConnected, detail: dbConnected ? `${status?.database?.roomsCount ?? 0} rooms` : "offline" },
    { key: "pbx", label: "Asterisk PBX", desc: "Phone exchange", Icon: Antenna, done: pbxConnected, detail: pbxConnected ? "AMI linked" : "not linked" },
    { key: "phone", label: "Room Phone", desc: "SIP registered", Icon: Phone, done: phoneRegistered, detail: phoneRegistered ? peers.join(", ") : "waiting" },
    { key: "ai", label: "Concierge", desc: "Ready to answer", Icon: AudioLines, done: aiReady, detail: activeCalls.length ? "on a call" : aiReady ? `dial ${AI_EXTENSION}` : "pending" },
  ];
  const done = stages.filter((s) => s.done).length;
  const pct = Math.round((done / stages.length) * 100);
  const firstPending = stages.findIndex((s) => !s.done);
  const allDone = done === stages.length;

  const R = 30, C = 2 * Math.PI * R;

  const connRows = [
    { label: "SIP server / host", value: SIP_HOST, key: "host" },
    { label: "Port (UDP)", value: SIP_PORT, key: "port" },
    { label: "Username / auth ID", value: "101", key: "user" },
    { label: "Password", value: "tushar123", key: "pass" },
    { label: "Dial to reach AI", value: AI_EXTENSION, key: "ext" },
  ];
  const pjsip = `[101]\ntype=endpoint\ncontext=from-internal\ndisallow=all\nallow=ulaw\nauth=101\naors=101\n\n[101]\ntype=auth\nauth_type=userpass\npassword=tushar123\nusername=101\n\n[101]\ntype=aor\nmax_contacts=1`;

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Connecting to system</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-7 animate-fadeIn">
      {/* Header + ring */}
      <div className="card p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <p className="eyebrow">Live connection status</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">Device Setup</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1 max-w-lg">
            Watch each piece connect in real time. When a room phone registers, guests can dial <span className="text-[var(--color-primary)] font-semibold">{AI_EXTENSION}</span> to reach the AI.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative w-[88px] h-[88px]">
            <svg className="w-[88px] h-[88px] -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r={R} fill="none" stroke="var(--color-line)" strokeWidth="6" />
              <circle cx="36" cy="36" r={R} fill="none" stroke={allDone ? "var(--color-sage)" : "var(--color-brass)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="stat-num text-xl text-[var(--color-ink)]">{pct}%</span>
            </div>
          </div>
          <div>
            <p className="stat-num text-3xl text-[var(--color-ink)]">{done}<span className="text-[var(--color-faint)] text-xl">/{stages.length}</span></p>
            <p className="eyebrow text-[10px] mt-1">linked</p>
          </div>
        </div>
      </div>

      {/* banner */}
      {allDone ? (
        <div className="card p-4 flex items-center gap-3 border-[var(--color-sage)] glow-pulse">
          <Check size={18} className="text-[var(--color-sage)]" />
          <p className="text-sm font-medium text-[var(--color-ink)]">All set — pick up a registered room phone and dial <span className="font-semibold">{AI_EXTENSION}</span> to reach the concierge.</p>
        </div>
      ) : (
        <div className="card p-4 flex items-center gap-3">
          <ArrowRight size={16} className="text-[var(--color-brass)]" />
          <p className="text-sm text-[var(--color-muted)]">Next: <span className="font-semibold text-[var(--color-ink)]">{stages[firstPending]?.label}</span> — {stages[firstPending]?.desc}.{stages[firstPending]?.key === "phone" && " Register a phone below, or flip the simulate switch to watch it connect."}</p>
        </div>
      )}

      {/* Signal path */}
      <div className="card p-6 md:p-8">
        <p className="eyebrow mb-7">Live signal path</p>
        <div className="flex items-start overflow-x-auto pb-2">
          {stages.map((stage, i) => {
            const isNext = i === firstPending && !stage.done;
            return (
              <div key={stage.key} className="flex items-start shrink-0">
                {i > 0 && (
                  <div className="flex items-center pt-7 px-1" style={{ width: 52 }}>
                    <div className={`h-1 w-full rounded-full ${stage.done ? "wire-flow" : stages[i - 1].done ? "bg-[var(--color-brass)]/40" : "bg-[var(--color-line)]"}`} />
                  </div>
                )}
                <div className="flex flex-col items-center text-center w-[88px]">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${stage.done ? "bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary)] animate-popIn" : isNext ? "bg-[var(--color-surface)] border-[var(--color-brass)] text-[var(--color-brass)] next-ping" : "bg-[var(--color-paper-deep)] border-[var(--color-line)] text-[var(--color-faint)]"}`}>
                    <stage.Icon size={22} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`dot ${stage.done ? "bg-[var(--color-sage)]" : isNext ? "bg-[var(--color-brass)] animate-pulse" : "bg-[var(--color-line-strong)]"}`} />
                    <span className={`text-[11px] font-semibold ${stage.done ? "text-[var(--color-primary-ink)]" : isNext ? "text-[var(--color-brass)]" : "text-[var(--color-faint)]"}`}>{stage.label}</span>
                  </div>
                  <p className="eyebrow text-[9px] mt-0.5">{stage.desc}</p>
                  <p className={`text-[10px] mt-1 tnum truncate max-w-[84px] ${stage.done ? "text-[var(--color-muted)]" : "text-[var(--color-faint)]"}`} title={stage.detail}>{stage.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-5 space-y-4">
          <p className="eyebrow">Watch it connect</p>
          <p className="text-sm text-[var(--color-muted)]">No phone handy? Register a virtual phone (ext 101) and watch <span className="font-semibold text-[var(--color-ink)]">Room Phone</span> light up.</p>
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--color-ink)]">Simulate phone 101</span>
            <button onClick={toggleMock} aria-label="Toggle simulated phone" className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${mock101 ? "bg-[var(--color-primary)]" : "bg-[var(--color-line-strong)]"}`}>
              <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition ${mock101 ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Demo data</p>
            <span className={`chip ${dbConnected ? "chip-sage" : "chip-clay"}`}>{dbConnected ? "DB connected" : "DB offline"}</span>
          </div>
          <p className="text-sm text-[var(--color-muted)]">Load sample rooms and a starter knowledge base for the AI.</p>
          <button onClick={seed} disabled={seeding || !dbConnected} className="btn btn-secondary w-full">{seeding ? "Seeding…" : "Seed rooms & FAQ"}</button>
          {seedOk && <p className="chip chip-sage"><Check size={13} /> Seeded</p>}
        </div>

        <div className="card p-5 space-y-3">
          <p className="eyebrow">Live readout</p>
          <div>
            <p className="eyebrow text-[10px] mb-1.5">Phones online</p>
            {peers.length ? <div className="flex flex-wrap gap-1.5">{peers.map((p) => <span key={p} className="chip chip-sage"><Phone size={12} /> {p}</span>)}</div> : <span className="text-sm text-[var(--color-faint)] italic">none</span>}
          </div>
          <div>
            <p className="eyebrow text-[10px] mb-1.5">Active calls</p>
            {activeCalls.length ? <div className="flex flex-wrap gap-1.5">{activeCalls.map((p) => <span key={p} className="chip chip-green"><span className="dot bg-[var(--color-sage)] animate-pulse" /> Room {p}</span>)}</div> : <span className="text-sm text-[var(--color-faint)] italic">none</span>}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="card p-6 md:p-8 space-y-7">
        <div>
          <h2 className="display text-xl font-semibold text-[var(--color-ink)]">Connect your existing phone system</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">Point any SIP device — IP phone, softphone, analog FXS gateway, or your current PBX — at SuiteTalk.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {connRows.map((row) => (
            <button key={row.key} onClick={() => copy(row.value, row.key)} className="group flex items-center justify-between rounded-lg border border-[var(--color-line)] hover:border-[var(--color-primary)] bg-[var(--color-paper)] px-4 py-3 text-left transition">
              <span>
                <span className="eyebrow text-[10px] block">{row.label}</span>
                <span className="font-mono text-sm font-semibold text-[var(--color-ink)]">{row.value}</span>
              </span>
              <span className="text-[var(--color-faint)] group-hover:text-[var(--color-primary)]">{copied === row.key ? <Check size={15} /> : <Copy size={15} />}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
          <div className="space-y-4">
            <p className="eyebrow">Steps</p>
            <ol className="space-y-3">
              {[
                "On your IP phone, softphone, or FXS gateway, add a SIP account with the settings above (transport UDP).",
                "Add the matching endpoint to pjsip.conf (right) and reload Asterisk.",
                "Register — watch the Room Phone step turn green in real time.",
                `Pick up the handset and dial ${AI_EXTENSION} to talk to the concierge.`,
              ].map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs font-semibold flex items-center justify-center tnum">{i + 1}</span>
                  <span className="text-sm text-[var(--color-ink)] leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-primary-soft)] p-4">
              <p className="text-xs font-semibold text-[var(--color-primary-ink)] mb-1">Same computer (easiest)</p>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">Install a softphone (MicroSIP, Zoiper) on this PC and register to <span className="font-mono">{SIP_HOST}:{SIP_PORT}</span>. Works immediately.</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-brass-soft)] p-4">
              <p className="text-xs font-semibold text-[var(--color-brass)] mb-1">Phones on your LAN</p>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">Asterisk runs in WSL2 — add a <span className="font-mono">[wsl2]</span> section with <span className="font-mono">networkingMode=mirrored</span> to <span className="font-mono">.wslconfig</span>, run <span className="font-mono">wsl --shutdown</span>, then point phones at this PC&apos;s LAN IP.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="eyebrow">PBX endpoint (pjsip.conf)</p>
              <button onClick={() => copy(pjsip, "pjsip")} className="btn btn-ghost btn-sm">{copied === "pjsip" ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
            </div>
            <pre className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-4 text-[11px] text-[var(--color-primary-ink)] font-mono leading-relaxed overflow-x-auto">{pjsip}</pre>
            <p className="text-xs text-[var(--color-faint)] leading-relaxed">Reload after editing: <code className="font-mono text-[var(--color-muted)]">asterisk -rx &quot;pjsip reload&quot;</code>. Duplicate the block for 102, 201, 301 to add more rooms.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
