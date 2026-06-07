import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Event metadata ────────────────────────────────────────────────────────────
const EVENT_META = {
  fall:            { color: "#ef4444", label: "Fall detected",  severity: "alert"  },
  fall_confirmed:  { color: "#ef4444", label: "Fall confirmed", severity: "alert"  },
  fall_cancelled:  { color: "#22c55e", label: "Fall cancelled", severity: "ok"     },
  gesture_help:    { color: "#a855f7", label: "Help gesture",   severity: "alert"  },
  inactivity:      { color: "#f59e0b", label: "Inactivity",     severity: "warn"   },
  alive_confirmed: { color: "#22c55e", label: "Check-in OK",    severity: "ok"     },
  walking:         { color: "#00c2d4", label: "Walking",        severity: "normal" },
  standing:        { color: "#3b82f6", label: "Standing",       severity: "normal" },
  sitting:         { color: "#6366f1", label: "Sitting",        severity: "normal" },
  laying_down:     { color: "#f59e0b", label: "Laying down",    severity: "normal" },
};
const em = (type) => EVENT_META[type] ?? { color: "#64748b", label: type, severity: "normal" };

// ── Utilities ─────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function initials(name) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
const AVATAR_COLORS = ["#1e3a5f", "#1a2e40", "#2d1b4e", "#1a3a2a", "#3a1a1a"];
function avatarBg(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function build7DayData(events) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString("en-GB", { weekday: "short" }), dateStr: d.toDateString(), falls: 0, gestures: 0, inactivity: 0 };
  });
  for (const ev of events) {
    const ds  = new Date(ev.created_at).toDateString();
    const day = days.find((d) => d.dateStr === ds);
    if (!day) continue;
    if (ev.event_type === "fall" || ev.event_type === "fall_confirmed") day.falls++;
    else if (ev.event_type === "gesture_help") day.gestures++;
    else if (ev.event_type === "inactivity")   day.inactivity++;
  }
  return days;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "system-ui, -apple-system, sans-serif", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh", fontSize: 13 },
  nav:  { background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "0 20px", display: "flex", alignItems: "center", gap: 0, height: 48 },
  body: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 },
};

// ── Components ────────────────────────────────────────────────────────────────
function Badge({ color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, letterSpacing: ".4px", textTransform: "uppercase", background: color + "20", color }}>
      {children}
    </span>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PatientCard({ patient, caregiver, lastEvent, onClick }) {
  const meta        = lastEvent ? em(lastEvent.event_type) : null;
  const statusColor = meta?.color ?? "#475569";
  const statusLabel = meta?.label ?? "No data";
  const isAlert     = meta?.severity === "alert";
  const isWarn      = meta?.severity === "warn";
  return (
    <div onClick={onClick} style={{ background: "#1e293b", border: `0.5px solid ${isAlert ? "#ef4444" : isWarn ? "#f59e0b" : "#334155"}`, borderRadius: 10, padding: 14, cursor: "pointer", transition: "border-color .15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: avatarBg(patient.id), color: "#00c2d4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {initials(patient.name)}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{patient.name}</div>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>{patient.device_id}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Badge color={statusColor}>{statusLabel}</Badge>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", borderTop: "0.5px solid #334155", paddingTop: 8 }}>
        <span>🕐 {lastEvent ? timeAgo(lastEvent.created_at) : "No events"}</span>
        <span>👤 {caregiver?.name ?? "No caregiver"}</span>
      </div>
    </div>
  );
}

function EventRow({ event, patientName }) {
  const m = em(event.event_type);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "0.5px solid #1e293b50" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: m.color, minWidth: 130 }}>{m.label}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", flex: 1 }}>{patientName}</div>
      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", minWidth: 40, textAlign: "right" }}>
        {event.confidence != null ? `${Math.round(event.confidence)}%` : ""}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", minWidth: 72, textAlign: "right" }}>{timeAgo(event.created_at)}</div>
    </div>
  );
}

function EventFeed({ events, patients, showFilter = true, maxHeight = 280 }) {
  const [filter, setFilter] = useState("all");
  const patientMap = Object.fromEntries(patients.map((p) => [p.id, p.name]));
  const FILTERS    = ["all", "alerts", "falls", "inactivity"];
  const filtered   = events.filter((e) => {
    if (filter === "all")        return true;
    if (filter === "alerts")     return ["fall_confirmed", "gesture_help", "inactivity"].includes(e.event_type);
    if (filter === "falls")      return e.event_type.startsWith("fall");
    if (filter === "inactivity") return ["inactivity", "alive_confirmed"].includes(e.event_type);
    return true;
  });
  return (
    <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid #334155" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Event feed</span>
        {showFilter && (
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "3px 9px", borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "0.5px solid #334155", background: filter === f ? "#0f172a" : "transparent", color: filter === f ? "#e2e8f0" : "#64748b", textTransform: "uppercase", letterSpacing: ".4px" }}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ maxHeight, overflowY: "auto" }}>
        {filtered.length === 0
          ? <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 12 }}>No events</div>
          : filtered.slice(0, 100).map((e) => <EventRow key={e.id} event={e} patientName={patientMap[e.patient_id] ?? e.device_id ?? "—"} />)
        }
      </div>
    </div>
  );
}

function PatientDetail({ patient, caregiver, events, onBack }) {
  const patientEvents = events.filter((e) => e.patient_id === patient.id);
  const lastEv        = patientEvents[0];
  const meta          = lastEv ? em(lastEv.event_type) : null;
  return (
    <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: "0.5px solid #334155" }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: avatarBg(patient.id), color: "#00c2d4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600 }}>
          {initials(patient.name)}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>{patient.name}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{patient.device_id}</div>
        </div>
        {meta && <Badge color={meta.color}>{meta.label}</Badge>}
        <button onClick={onBack} style={{ marginLeft: "auto", background: "#0f172a", border: "0.5px solid #334155", color: "#94a3b8", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
          ← Back
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          ["Caregiver",    caregiver?.name   ?? "—"],
          ["Email",        caregiver?.email  ?? "—"],
          ["Phone",        caregiver?.phone  ?? "—"],
          ["Address",      patient.address   ?? "—"],
          ["Total events", patientEvents.length],
          ["Patient since", fmtDate(patient.created_at)],
        ].map(([label, val]) => (
          <div key={label} style={{ background: "#0f172a", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{val}</div>
          </div>
        ))}
      </div>
      <EventFeed events={patientEvents} patients={[patient]} showFilter={false} maxHeight={260} />
    </div>
  );
}

function WifiScans({ scans, patients }) {
  const patientByDevice = Object.fromEntries(patients.map((p) => [p.device_id, p.name]));
  const grouped = {};
  for (const s of scans.slice(0, 40)) {
    if (!grouped[s.device_id]) grouped[s.device_id] = [];
    grouped[s.device_id].push(s);
  }
  if (!scans.length) return <div style={{ textAlign: "center", color: "#475569", padding: 40, fontSize: 12 }}>No WiFi scan data yet</div>;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>Recent WiFi scans</div>
      <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {Object.entries(grouped).map(([device, deviceScans]) => (
            <div key={device} style={{ padding: "10px 14px", borderBottom: "0.5px solid #334155" }}>
              <div style={{ fontSize: 11, color: "#00c2d4", fontWeight: 600, marginBottom: 8 }}>📡 {patientByDevice[device] ?? device}</div>
              {deviceScans.slice(0, 6).map((s) => {
                const rssi = s.rssi ?? -100;
                const bars = rssi > -60 ? 4 : rssi > -70 ? 3 : rssi > -80 ? 2 : 1;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#0f172a", borderRadius: 8, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 14 }}>
                      {[1,2,3,4].map((n) => (
                        <div key={n} style={{ width: 3, height: n * 3 + 4, borderRadius: 1, background: n <= bars ? "#00c2d4" : "#334155" }} />
                      ))}
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>{s.ssid || "(hidden)"}</div>
                    <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{rssi} dBm</div>
                    <div style={{ fontSize: 10, color: "#475569", minWidth: 72, textAlign: "right" }}>{timeAgo(s.scanned_at)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", border: "0.5px solid #334155", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p) => <div key={p.dataKey} style={{ color: p.fill, marginTop: 2 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
    else onLogin();
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: "#0f172a",
    border: "0.5px solid #334155",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 340, background: "#1e293b", border: "0.5px solid #334155", borderRadius: 14, padding: 28 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <div style={{ width: 8, height: 8, background: "#00c2d4", borderRadius: "50%" }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: "#00c2d4", letterSpacing: 1 }}>FALLGUARD</span>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>Caregiver Sign In</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>Access your patient monitoring dashboard</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 5 }}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKey}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 5 }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKey}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{ background: "#ef444420", border: "0.5px solid #ef4444", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#ef4444", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "10px", background: loading ? "#164e63" : "#0e7490", border: "none", borderRadius: 8, color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", transition: "background .15s" }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession]             = useState(undefined); // undefined = checking
  const [tab, setTab]                     = useState("overview");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients]           = useState([]);
  const [caregivers, setCaregivers]       = useState([]);
  const [events, setEvents]               = useState([]);
  const [wifiScans, setWifiScans]         = useState([]);
  const [loading, setLoading]             = useState(true);

  // ── Auth listener ──────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Data loading (only when authenticated) ─────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: pats },
      { data: cgs  },
      { data: evs  },
      { data: wifi },
    ] = await Promise.all([
      sb.from("patients").select("*"),
      sb.from("caregivers").select("*"),
      sb.from("events").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("wifi_scans").select("*").order("scanned_at", { ascending: false }).limit(100),
    ]);
    setPatients(pats   ?? []);
    setCaregivers(cgs  ?? []);
    setEvents(evs      ?? []);
    setWifiScans(wifi  ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadAll();
    const ch = sb.channel("fallguard-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) =>
        setEvents((prev) => [p.new, ...prev])
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wifi_scans" }, (p) =>
        setWifiScans((prev) => [p.new, ...prev])
      )
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [session, loadAll]);

  const handleSignOut = async () => {
    await sb.auth.signOut();
    setPatients([]);
    setCaregivers([]);
    setEvents([]);
    setWifiScans([]);
    setTab("overview");
    setSelectedPatient(null);
  };

  // ── Render: checking auth ──────────────────────────────────
  if (session === undefined) {
    return (
      <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, flexDirection: "column", gap: 14 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #1e293b", borderTopColor: "#00c2d4", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
        <span style={{ fontSize: 12, color: "#475569" }}>Checking session...</span>
      </div>
    );
  }

  // ── Render: not logged in ──────────────────────────────────
  if (!session) {
    return <LoginScreen onLogin={() => {}} />;
  }

  // ── Render: loading data ───────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, flexDirection: "column", gap: 14 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #1e293b", borderTopColor: "#00c2d4", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
        <span style={{ fontSize: 12, color: "#475569" }}>Loading patient data...</span>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────
  const cgMap           = Object.fromEntries(caregivers.map((c) => [c.id, c]));
  const patientLastEvent = (id) => events.find((e) => e.patient_id === id);
  const todayFalls      = events.filter((e) =>
    e.event_type === "fall_confirmed" && new Date(e.created_at).toDateString() === new Date().toDateString()
  ).length;
  const alertCount      = events.filter((e) => ["fall_confirmed", "gesture_help", "inactivity"].includes(e.event_type)).length;
  const detailPatient   = selectedPatient ? patients.find((p) => p.id === selectedPatient) : null;

  const TABS = [
    { id: "overview", label: "Overview"   },
    { id: "events",   label: "Events"     },
    { id: "wifi",     label: "WiFi Scans" },
  ];

  return (
    <div style={S.root}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* Nav */}
      <nav style={S.nav}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#00c2d4", letterSpacing: 1, marginRight: 28, display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 7, height: 7, background: "#00c2d4", borderRadius: "50%", animation: "pulse 2s infinite" }} />
          FALLGUARD
        </div>
        <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "stretch" }}>
          {TABS.map((t) => (
            <div key={t.id} onClick={() => { setTab(t.id); setSelectedPatient(null); }} style={{ padding: "0 14px", display: "flex", alignItems: "center", fontSize: 12, fontWeight: 500, cursor: "pointer", color: tab === t.id && !selectedPatient ? "#00c2d4" : "#64748b", borderBottom: `2px solid ${tab === t.id && !selectedPatient ? "#00c2d4" : "transparent"}`, transition: "color .15s" }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* Right side: user info + sign out */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#22c55e", fontWeight: 500 }}>
            <div style={{ width: 6, height: 6, background: "#22c55e", borderRadius: "50%", animation: "pulse 1.5s infinite" }} />
            LIVE
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{session.user.email}</div>
          <button onClick={handleSignOut} style={{ background: "#1e293b", border: "0.5px solid #334155", color: "#94a3b8", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={S.body}>
        {/* Patient detail view */}
        {detailPatient ? (
          <PatientDetail patient={detailPatient} caregiver={cgMap[detailPatient.caregiver_id]} events={events} onBack={() => setSelectedPatient(null)} />
        ) : tab === "overview" ? (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              <StatCard label="Patients"      value={patients.length}                              color="#00c2d4" sub="monitored" />
              <StatCard label="Today's falls" value={todayFalls}                                   color={todayFalls > 0 ? "#ef4444" : "#22c55e"} sub="confirmed" />
              <StatCard label="Total alerts"  value={alertCount}                                   color="#f59e0b" sub="all time" />
              <StatCard label="Events logged" value={events.length}                                color="#94a3b8" sub="total" />
            </div>

            {/* Patient cards */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>Patients</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                {patients.map((p) => (
                  <PatientCard key={p.id} patient={p} caregiver={cgMap[p.caregiver_id]} lastEvent={patientLastEvent(p.id)} onClick={() => setSelectedPatient(p.id)} />
                ))}
                {!patients.length && (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "#475569", fontSize: 12 }}>No patients found</div>
                )}
              </div>
            </div>

            {/* 7-day chart */}
            <div style={{ background: "#1e293b", border: "0.5px solid #334155", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>7-day alert activity</span>
                <div style={{ display: "flex", gap: 12 }}>
                  {[["#ef4444","Falls"],["#a855f7","Help"],["#f59e0b","Inactivity"]].map(([c,l]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748b" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={build7DayData(events)} margin={{ top: 4, right: 0, left: -32, bottom: 0 }} barSize={8} barGap={2}>
                  <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Bar dataKey="falls"      name="Falls"      fill="#ef444460" radius={[2,2,0,0]} />
                  <Bar dataKey="gestures"   name="Help"       fill="#a855f760" radius={[2,2,0,0]} />
                  <Bar dataKey="inactivity" name="Inactivity" fill="#f59e0b60" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : tab === "events" ? (
          <EventFeed events={events} patients={patients} showFilter maxHeight={460} />
        ) : tab === "wifi" ? (
          <WifiScans scans={wifiScans} patients={patients} />
        ) : null}
      </div>
    </div>
  );
}