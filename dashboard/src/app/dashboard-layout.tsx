"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Gauge, Bell, Chat, Key, Book, Sliders, Plug, Users, Building,
  AudioLines, LogOut, History,
} from "@/lib/icons";
import { NotificationBell } from "@/components/NotificationBell";

interface Staff {
  id: number;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "STAFF";
}

interface Hotel {
  id: number;
  name: string;
  slug: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedStaff = localStorage.getItem("current_staff");
    const storedHotel = localStorage.getItem("current_hotel");
    if (storedStaff && storedHotel) {
      setStaff(JSON.parse(storedStaff));
      setHotel(JSON.parse(storedHotel));
    } else {
      setStaff(null);
      setHotel(null);
      if (pathname !== "/login") router.replace("/login");
    }
    setLoading(false);
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem("current_staff");
    localStorage.removeItem("current_hotel");
    setStaff(null);
    setHotel(null);
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
          <p className="eyebrow">Loading SuiteTalk</p>
        </div>
      </div>
    );
  }

  // Login is the only sidebar-less view.
  if (pathname === "/login") return <>{children}</>;
  if (!staff) return null;

  const role = staff?.role || "STAFF";
  const isOwner = role === "OWNER";
  const isManager = role === "MANAGER" || role === "OWNER";

  const routePermissions: Record<string, boolean> = {
    "/": true, "/requests": true, "/chats": true, "/history": true,
    "/rooms": isManager, "/kb": isManager, "/settings": isManager,
    "/setup": isManager, "/simulator": isManager,
    "/staff": isOwner, "/business": isOwner,
  };
  const hasAccess = routePermissions[pathname] ?? true;

  return (
    <div className="flex h-screen overflow-hidden">
      {renderSidebar(staff, hotel, pathname, handleLogout)}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {renderHeader(hotel)}
        <div className="px-6 md:px-10 py-8 flex-1">
          {hasAccess ? children : <AccessDenied role={role} pathname={pathname} onHome={() => router.push("/")} />}
        </div>
      </main>
    </div>
  );
}

const navMain = [
  { href: "/", label: "Dashboard", Icon: Gauge },
  { href: "/requests", label: "Requests", Icon: Bell },
  { href: "/chats", label: "Live Chats", Icon: Chat },
  { href: "/history", label: "Guest History", Icon: History },
];
const navOps = [
  { href: "/rooms", label: "Rooms", Icon: Key },
  { href: "/kb", label: "Knowledge", Icon: Book },
  { href: "/settings", label: "AI Settings", Icon: Sliders },
  { href: "/setup", label: "Device Setup", Icon: Plug },
];
const navAdmin = [
  { href: "/staff", label: "Staff", Icon: Users },
  { href: "/business", label: "Hotel Profile", Icon: Building },
];

function NavLink({ href, label, Icon, active }: { href: string; label: string; Icon: React.ComponentType<{ size?: number }>; active: boolean }) {
  return (
    <a href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon size={18} />
      <span>{label}</span>
    </a>
  );
}

function renderSidebar(staff: Staff | null, hotel: Hotel | null, pathname: string, onLogout: () => void) {
  const role = staff?.role || "STAFF";
  const isOwner = role === "OWNER";
  const isManager = role === "MANAGER" || role === "OWNER";

  return (
    <aside className="w-64 shrink-0 flex flex-col justify-between bg-[var(--color-surface)] border-r border-[var(--color-line)]">
      <div>
        {/* Wordmark */}
        <div className="px-5 h-[68px] flex items-center gap-3 border-b border-[var(--color-line)]">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center">
            <AudioLines size={18} />
          </div>
          <div className="leading-tight">
            <p className="display text-lg font-semibold text-[var(--color-ink)]">SuiteTalk</p>
            <p className="eyebrow text-[10px]">{hotel?.name || "Concierge"}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-1">
          {navMain.map((n) => <NavLink key={n.href} {...n} active={pathname === n.href} />)}

          {isManager && (
            <>
              <p className="eyebrow px-3 pt-5 pb-2 text-[10px]">Operations</p>
              {navOps.map((n) => <NavLink key={n.href} {...n} active={pathname === n.href} />)}
            </>
          )}

          {isOwner && (
            <>
              <p className="eyebrow px-3 pt-5 pb-2 text-[10px]">Administration</p>
              {navAdmin.map((n) => <NavLink key={n.href} {...n} active={pathname === n.href} />)}
            </>
          )}
        </nav>
      </div>

      <div className="p-3 space-y-3 border-t border-[var(--color-line)]">
        {isManager && (
          <a href="/simulator" className="btn btn-secondary w-full">
            <AudioLines size={16} />
            <span>Guest Simulator</span>
          </a>
        )}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-ink)] truncate">{staff?.name}</p>
            <p className="eyebrow text-[10px] text-[var(--color-brass)]">{role}</p>
          </div>
          <button onClick={onLogout} title="Log out" aria-label="Log out" className="btn btn-ghost btn-sm px-2">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function renderHeader(hotel: Hotel | null) {
  return (
    <header className="h-[68px] shrink-0 flex items-center justify-between px-6 md:px-10 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_80%,transparent)] backdrop-blur-sm sticky top-0 z-30">
      <p className="eyebrow">Front Desk{hotel ? ` · ${hotel.name}` : ""}</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="dot bg-[var(--color-sage)]" />
          <span className="eyebrow text-[10px]">Concierge Online</span>
        </div>
        <NotificationBell />
      </div>
    </header>
  );
}

function AccessDenied({ role, pathname, onHome }: { role: string; pathname: string; onHome: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-16 card p-8 text-center space-y-5">
      <p className="display text-xl text-[var(--color-ink)]">Not available for your role</p>
      <p className="text-sm text-[var(--color-muted)]">
        Your role (<span className="text-[var(--color-brass)] font-semibold">{role}</span>) doesn&apos;t have access to{" "}
        <code className="text-[var(--color-clay)]">{pathname}</code>.
      </p>
      <button onClick={onHome} className="btn btn-secondary mx-auto">Return to Dashboard</button>
    </div>
  );
}
