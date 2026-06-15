"use client";

import { useEffect, useState } from "react";
import { API_BASE, HOTEL_ID } from "@/lib/config";
import { Check, Book, Sparkle, Sun, Car, Package, Leaf, Utensils, Key, Wrench, Clock, Users, Search } from "@/lib/icons";

// ── Tool catalogue (mirrors backend TOOL_METADATA) ───────────────────────────

const TOOL_CATEGORIES = [
  {
    label: "Core",
    chipClass: "chip-green",
    tools: [
      { name: "get_room_and_guest_info", label: "Guest Info Lookup", description: "Retrieve room and guest details on demand.", Icon: Key },
      { name: "concierge_search", label: "Knowledge Base Search", description: "Answer hotel FAQs and policies via semantic search.", Icon: Search },
    ],
  },
  {
    label: "Dining",
    chipClass: "chip-ochre",
    tools: [
      { name: "dining_request", label: "Dining Orders", description: "Order, cancel, or update meals for room service or dining hall.", Icon: Utensils },
      { name: "room_service_menu", label: "Room Service Menu", description: "Browse available menu items by category.", Icon: Book },
    ],
  },
  {
    label: "Rooms",
    chipClass: "chip-neutral",
    tools: [
      { name: "housekeeping_service", label: "Housekeeping", description: "Request towels, cleaning, laundry, and room supplies.", Icon: Sparkle },
      { name: "maintenance_report", label: "Maintenance Reports", description: "Log technical issues and faults in the room.", Icon: Wrench },
    ],
  },
  {
    label: "Front Desk",
    chipClass: "chip-brass",
    tools: [
      { name: "parcel_delivery_inquiry", label: "Parcel Delivery", description: "Check for arrived parcels and request delivery to room.", Icon: Package },
      { name: "manage_visitor_access", label: "Visitor Management", description: "Allow or deny visitor entry on behalf of the guest.", Icon: Users },
      { name: "extend_stay_request", label: "Stay Extension", description: "Request to push the guest's checkout date forward.", Icon: Clock },
    ],
  },
  {
    label: "Guest Services",
    chipClass: "chip-sage",
    tools: [
      { name: "wake_up_call", label: "Wake-Up Calls", description: "Schedule a wake-up call at the guest's requested time.", Icon: Sun },
      { name: "spa_and_wellness", label: "Spa & Wellness", description: "Book spa treatments, gym sessions, and pool access.", Icon: Leaf },
      { name: "transportation_request", label: "Transportation", description: "Arrange taxi, airport transfers, or hotel shuttle.", Icon: Car },
      { name: "lost_and_found", label: "Lost & Found", description: "Report lost items or inquire about found items.", Icon: Package },
    ],
  },
];

const ALL_TOOL_NAMES = TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => t.name));

const DEFAULT_BASE_RULES = `RULES:
1. LANGUAGE: Detect the guest's language and respond in the SAME language.
2. TRANSLATION: When you call a tool, always write the free-text arguments (e.g. description, issue_description, request_item) in ENGLISH so staff can read them, even if the guest spoke another language.
3. ACTIONS RUN IN THE BACKGROUND — NEVER GO SILENT: Tools run asynchronously while you keep talking. Say a short acknowledgement first and KEEP the conversation going. Weave tool results in naturally when they arrive. If a result is an error, apologise briefly and offer an alternative.
4. KNOWLEDGE: For any question about the hotel (hours, wifi, dining, policies, amenities, directions), call concierge_search and answer ONLY from what it returns. If it returns nothing relevant, say you'll check with the front desk rather than guessing.
5. If a request is ambiguous, ask one short clarifying question.`;

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "personality" | "rules" | "tools";

interface Settings {
  agent_name: string;
  hotel_name: string;
  ai_tone: string;
  ai_instructions: string;
  ai_base_rules: string;
}

// ── Page component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("personality");
  const [settings, setSettings] = useState<Settings>({
    agent_name: "SuiteTalk Concierge",
    hotel_name: "The Grand Suite",
    ai_tone: "Warm, professional, and discreet",
    ai_instructions: "Greet guests by name when known and keep replies brief and courteous.",
    ai_base_rules: "",
  });
  const [enabledTools, setEnabledTools] = useState<string[]>(ALL_TOOL_NAMES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings?hotelId=${HOTEL_ID}`);
      if (res.ok) {
        const d = await res.json();
        if (Object.keys(d).length) {
          setSettings((prev) => ({
            ...prev,
            ...(d.agent_name !== undefined ? { agent_name: d.agent_name } : {}),
            ...(d.hotel_name !== undefined ? { hotel_name: d.hotel_name } : {}),
            ...(d.ai_tone !== undefined ? { ai_tone: d.ai_tone } : {}),
            ...(d.ai_instructions !== undefined ? { ai_instructions: d.ai_instructions } : {}),
            ...(d.ai_base_rules !== undefined ? { ai_base_rules: d.ai_base_rules } : {}),
          }));
          if (d.enabled_tools) {
            try { setEnabledTools(JSON.parse(d.enabled_tools)); } catch {}
          }
        }
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchSettings(); }, []);

  const toggleTool = (name: string) =>
    setEnabledTools((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { ...settings, enabled_tools: JSON.stringify(enabledTools) },
          hotelId: HOTEL_ID,
        }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  if (loading) return <Loading />;

  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: "personality", label: "Personality", hint: "Name, tone & instructions" },
    { id: "rules", label: "System Rules", hint: "Behaviour prompt" },
    { id: "tools", label: "AI Tools", hint: `${enabledTools.length} of ${ALL_TOOL_NAMES.length} enabled` },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-7 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Concierge configuration</p>
          <h1 className="display text-3xl font-semibold text-[var(--color-ink)] mt-1">AI Settings</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Control the personality, rules, and capabilities of your voice concierge.
          </p>
        </div>
        <span className="chip chip-green">
          <span className="dot bg-[var(--color-sage)]" /> {enabledTools.length} tools active
        </span>
      </div>

      {/* Tab bar */}
      <div className="grid grid-cols-3 gap-2">
        {tabs.map(({ id, label, hint }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              tab === id
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-ink)]"
                : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
            }`}
          >
            <p className={`text-sm font-semibold ${tab === id ? "text-[var(--color-primary-ink)]" : ""}`}>{label}</p>
            <p className={`text-xs mt-0.5 ${tab === id ? "text-[var(--color-primary-ink)] opacity-70" : "text-[var(--color-faint)]"}`}>{hint}</p>
          </button>
        ))}
      </div>

      {/* Tab content card */}
      <div className="card p-7 space-y-0">
        {tab === "personality" && (
          <PersonalityTab settings={settings} setSettings={setSettings} />
        )}
        {tab === "rules" && (
          <RulesTab
            rules={settings.ai_base_rules}
            setRules={(v) => setSettings((s) => ({ ...s, ai_base_rules: v }))}
          />
        )}
        {tab === "tools" && (
          <ToolsTab
            enabledTools={enabledTools}
            onToggle={toggleTool}
            onToggleAll={() =>
              setEnabledTools(enabledTools.length === ALL_TOOL_NAMES.length ? [] : ALL_TOOL_NAMES)
            }
          />
        )}

        {/* Save row */}
        <div className="flex items-center gap-3 pt-6 mt-6 border-t border-[var(--color-line)]">
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <span className="chip chip-sage">
              <Check size={13} /> Saved
            </span>
          )}
          <span className="text-xs text-[var(--color-faint)] ml-auto">Changes apply to the next guest call</span>
        </div>
      </div>
    </div>
  );
}

// ── Personality tab ──────────────────────────────────────────────────────────

function PersonalityTab({ settings, setSettings }: { settings: Settings; setSettings: (v: Settings) => void }) {
  const set = (key: keyof Settings) => (v: string) => setSettings({ ...settings, [key]: v });

  return (
    <div className="space-y-7">
      <Section title="Agent Identity" subtitle="How the AI introduces itself to guests.">
        <Field label="Agent name" value={settings.agent_name} onChange={set("agent_name")}
          hint='e.g. "Aria", "Max", "SuiteTalk Concierge"' />
        <Field label="Hotel property name" value={settings.hotel_name} onChange={set("hotel_name")}
          hint='Used in greetings: "Welcome to The Grand Suite…"' />
      </Section>

      <hr className="rule" />

      <Section title="Voice & Tone" subtitle="Shape how the concierge speaks and behaves in every conversation.">
        <Field label="Tone & personality" value={settings.ai_tone} onChange={set("ai_tone")}
          hint='e.g. "Warm, professional, and discreet" or "Friendly and casual"' />
        <Field label="Base instructions" value={settings.ai_instructions} onChange={set("ai_instructions")}
          hint="Hotel-specific guidance injected into every system prompt." textarea rows={5} />
      </Section>
    </div>
  );
}

// ── System Rules tab ─────────────────────────────────────────────────────────

function RulesTab({ rules, setRules }: { rules: string; setRules: (v: string) => void }) {
  const isDefault = !rules || rules === DEFAULT_BASE_RULES;
  const displayValue = rules || DEFAULT_BASE_RULES;

  return (
    <div className="space-y-5">
      <Section
        title="Behaviour Rules"
        subtitle="These rules are appended to every system prompt and control how the AI handles language, tools, and ambiguity. Leave blank to use the built-in defaults."
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="eyebrow text-[10px]">Rules prompt</label>
            {!isDefault && (
              <button onClick={() => setRules("")} className="text-xs text-[var(--color-clay)] hover:underline font-medium">
                Reset to default
              </button>
            )}
          </div>
          <textarea
            className="field font-mono text-xs leading-relaxed"
            rows={16}
            value={displayValue}
            onChange={(e) => setRules(e.target.value)}
          />
        </div>
        {isDefault && (
          <p className="text-xs text-[var(--color-faint)] italic">
            Showing built-in defaults. Edit above to customise — your version will be saved.
          </p>
        )}
      </Section>
    </div>
  );
}

// ── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({ enabledTools, onToggle, onToggleAll }: {
  enabledTools: string[];
  onToggle: (name: string) => void;
  onToggleAll: () => void;
}) {
  const allOn = enabledTools.length === ALL_TOOL_NAMES.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Tool Capabilities</h2>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">
            Control which actions the AI concierge can perform. Disabled tools are hidden from the model entirely.
          </p>
        </div>
        <button onClick={onToggleAll} className="btn btn-secondary btn-sm shrink-0">
          {allOn ? "Disable all" : "Enable all"}
        </button>
      </div>

      <div className="space-y-6">
        {TOOL_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`chip ${cat.chipClass}`}>{cat.label}</span>
              <span className="text-xs text-[var(--color-faint)]">
                {cat.tools.filter((t) => enabledTools.includes(t.name)).length}/{cat.tools.length} enabled
              </span>
            </div>
            <div className="space-y-2">
              {cat.tools.map((tool) => {
                const on = enabledTools.includes(tool.name);
                return (
                  <div
                    key={tool.name}
                    onClick={() => onToggle(tool.name)}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all select-none ${
                      on
                        ? "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]"
                        : "border-dashed border-[var(--color-line)] bg-[var(--color-paper)] opacity-60 hover:opacity-80"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${
                      on ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-ink)]" : "bg-[var(--color-paper-deep)] text-[var(--color-faint)]"
                    }`}>
                      <tool.Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${on ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"}`}>
                        {tool.label}
                      </p>
                      <p className="text-xs text-[var(--color-faint)] mt-0.5">{tool.description}</p>
                    </div>
                    <Toggle enabled={on} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--color-faint)] pt-2 border-t border-[var(--color-line)]">
        <span>{enabledTools.length} of {ALL_TOOL_NAMES.length} tools enabled</span>
        <span>Click a tool to toggle it</span>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, hint, textarea, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; textarea?: boolean; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="eyebrow text-[10px]">{label}</label>
      {textarea
        ? <textarea className="field" rows={rows ?? 4} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className="field" value={value} onChange={(e) => onChange(e.target.value)} />}
      {hint && <p className="text-xs text-[var(--color-faint)]">{hint}</p>}
    </div>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={`relative w-10 h-6 rounded-full flex-none transition-colors ${
        enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-line-strong)]"
      }`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
        enabled ? "translate-x-4" : "translate-x-0"
      }`} />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-primary)]" />
      <p className="eyebrow">Loading settings</p>
    </div>
  );
}
