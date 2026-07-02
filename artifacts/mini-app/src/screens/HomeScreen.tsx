import { useState } from "react";
import type { Config, CallType, GenderFilter } from "../types.js";
import { CoinBadge } from "../components/CoinBadge.js";

interface Props {
  config:  Config;
  coins:   number;
  onStart: (callType: CallType, genderFilter: GenderFilter) => void;
  loading: boolean;
  error:   string | null;
}

export function HomeScreen({ config, coins, onStart, loading, error }: Props) {
  const [callType,     setCallType]     = useState<CallType>("voice");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("random");

  const cost =
    callType === "voice"
      ? genderFilter === "random" ? config.costs.voiceRandom : config.costs.voiceGender
      : genderFilter === "random" ? config.costs.videoRandom : config.costs.videoGender;

  const canCall = coins >= cost && !loading;

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div style={s.logoWrap}>
          <span style={s.logoEmoji}>📞</span>
          <div style={s.logoBg} />
        </div>
        <h1 style={s.title}>تماس ناشناس</h1>
        <p style={s.subtitle}>با یک غریبه صحبت کن</p>
        <CoinBadge coins={coins} />
      </div>

      {/* Call type */}
      <div style={s.section}>
        <p style={s.label}>نوع تماس</p>
        <div style={s.tabs}>
          {(["voice", "video"] as CallType[]).map(ct => {
            const active   = callType === ct;
            const disabled = ct === "video" && !config.videoEnabled;
            return (
              <button
                key={ct}
                onClick={() => !disabled && setCallType(ct)}
                disabled={disabled}
                style={{ ...s.tab, ...(active ? s.tabActive : {}), ...(disabled ? s.tabDis : {}) }}
              >
                <span style={s.tabIcon}>{ct === "voice" ? "🎤" : "📹"}</span>
                <span style={s.tabText}>{ct === "voice" ? "صوتی" : "تصویری"}</span>
                {disabled && <span style={s.tabBadge}>غیرفعال</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gender */}
      <div style={s.section}>
        <p style={s.label}>طرف مقابل</p>
        <div style={s.chips}>
          {([
            { v: "random", icon: "🎲", label: "هر کسی" },
            { v: "male",   icon: "👦", label: "پسر"    },
            { v: "female", icon: "👧", label: "دختر"   },
          ] as { v: GenderFilter; icon: string; label: string }[]).map(({ v, icon, label }) => (
            <button
              key={v}
              onClick={() => setGenderFilter(v)}
              style={{ ...s.chip, ...(genderFilter === v ? s.chipOn : {}) }}
            >
              <span style={{ fontSize: "20px" }}>{icon}</span>
              <span style={s.chipTxt}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cost */}
      <div style={s.costRow}>
        <span style={s.costLbl}>هزینه اتصال</span>
        <div style={s.costVal}>
          <span style={s.costNum}>{cost}</span>
          <span style={s.costUnit}> سکه 🪙</span>
        </div>
      </div>

      {error && (
        <div style={s.errBox}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        style={{ ...s.btn, ...(canCall ? {} : s.btnOff) }}
        onClick={() => canCall && onStart(callType, genderFilter)}
        disabled={!canCall}
      >
        {loading
          ? <><span style={s.spinner} />{"  "}در حال اتصال...</>
          : coins < cost
            ? `موجودی کافی نیست (${cost} سکه لازم)`
            : callType === "voice" ? "🎤  شروع تماس صوتی" : "📹  شروع تماس تصویری"}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", padding: "32px 20px 28px",
    display: "flex", flexDirection: "column", gap: "20px",
    animation: "fadeUp .35s ease both",
  },
  header: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
    paddingBottom: "4px",
  },
  logoWrap: {
    position: "relative", width: "72px", height: "72px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  logoEmoji: {
    fontSize: "38px", position: "relative", zIndex: 1,
    animation: "float 3s ease-in-out infinite",
  },
  logoBg: {
    position: "absolute", inset: 0, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)",
    animation: "glow 2.5s ease-in-out infinite",
  },
  title:    { fontSize: "22px", fontWeight: 800, letterSpacing: "0.3px" },
  subtitle: { fontSize: "13px", color: "var(--muted)", marginTop: "-4px" },
  section:  { display: "flex", flexDirection: "column", gap: "10px" },
  label:    { fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" },
  tabs:     { display: "flex", gap: "10px" },
  tab: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
    padding: "16px 8px", borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
    color: "var(--text)", cursor: "pointer", transition: "all .2s", position: "relative",
  },
  tabActive: {
    background: "rgba(124,58,237,0.16)", border: "1px solid rgba(124,58,237,0.45)",
    color: "#c4b5fd",
  },
  tabDis:   { opacity: 0.3, cursor: "not-allowed" },
  tabIcon:  { fontSize: "26px" },
  tabText:  { fontSize: "14px", fontWeight: 600 },
  tabBadge: {
    position: "absolute", top: "6px", right: "8px", fontSize: "9px",
    background: "rgba(239,68,68,0.2)", color: "#fca5a5",
    borderRadius: "4px", padding: "1px 5px", fontWeight: 700,
  },
  chips: { display: "flex", gap: "8px" },
  chip: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
    padding: "14px 8px", borderRadius: "14px",
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
    color: "var(--text)", cursor: "pointer", transition: "all .2s",
  },
  chipOn: {
    background: "rgba(124,58,237,0.16)", border: "1px solid rgba(124,58,237,0.45)",
  },
  chipTxt:  { fontSize: "12px", fontWeight: 600, color: "var(--muted)" },
  costRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px", padding: "14px 18px",
  },
  costLbl: { fontSize: "14px", color: "var(--muted)", fontWeight: 500 },
  costVal: { display: "flex", alignItems: "baseline", gap: "2px" },
  costNum: { fontSize: "24px", fontWeight: 800, color: "var(--gold)" },
  costUnit: { fontSize: "13px", color: "var(--gold)", fontWeight: 600 },
  errBox: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "14px", padding: "12px 16px", fontSize: "14px", color: "#fca5a5",
    animation: "scalePop .2s ease",
  },
  btn: {
    width: "100%", padding: "18px", borderRadius: "18px", border: "none",
    background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff",
    fontSize: "16px", fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 8px 32px rgba(124,58,237,0.4)", transition: "opacity .2s",
  },
  btnOff: {
    background: "rgba(255,255,255,0.08)", boxShadow: "none", opacity: 0.55, cursor: "not-allowed",
  },
  spinner: {
    display: "inline-block", width: "14px", height: "14px", borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff",
    animation: "spin .7s linear infinite", marginLeft: "6px",
  },
};
