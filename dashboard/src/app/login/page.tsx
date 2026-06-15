"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/config";
import { AudioLines } from "@/lib/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem("current_staff", JSON.stringify(data.staff));
        localStorage.setItem("current_hotel", JSON.stringify(data.hotel));
        router.push("/");
      } else {
        setError(data.error || "Login failed. Please check your credentials.");
      }
    } catch {
      setError("Could not reach the server. Is the backend running on port 3001?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--color-primary)] text-[#EDEFE9]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#EDEFE9]/15 flex items-center justify-center"><AudioLines size={18} /></div>
          <span className="display text-lg font-semibold">SuiteTalk</span>
        </div>
        <div className="space-y-5 max-w-md">
          <p className="display text-4xl font-medium leading-[1.15] italic">
            &ldquo;Good evening. How may I help you tonight?&rdquo;
          </p>
          <p className="text-sm text-[#EDEFE9]/70 leading-relaxed">
            The AI voice concierge that answers every room phone, around the clock — and routes the rest to your front desk.
          </p>
        </div>
        <p className="eyebrow text-[#EDEFE9]/50">On-premise · Voice AI · Front desk</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="eyebrow">Staff Portal</p>
            <h1 className="display text-3xl font-semibold text-[var(--color-ink)]">Welcome back</h1>
            <p className="text-sm text-[var(--color-muted)]">Sign in to the concierge control center.</p>
          </div>

          {error && (
            <div className="chip chip-clay !h-auto !rounded-lg w-full justify-start py-2.5 px-3">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="eyebrow text-[10px]" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" placeholder="owner@suitetalk.local"
                value={email} onChange={(e) => setEmail(e.target.value)} className="field" required disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <label className="eyebrow text-[10px]" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} className="field" required disabled={loading} />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-[var(--color-faint)] text-center">
            New staff accounts are created by the owner from the Staff Directory.
          </p>
        </div>
      </div>
    </div>
  );
}
