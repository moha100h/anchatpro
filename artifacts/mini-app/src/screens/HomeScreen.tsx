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
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.logo}>📞</span>
        <h1 style={s.title}>تماس ناشناس</h1>
        <CoinBadge coins={coins} />
      </div>

      <div style={s.card}>
        <p style={s.label}>نوع تماس</p>
        <div style={s.toggleRow}>
          {(["voice", "video"] as CallType[]).map(ct => (
            <button
              key={ct}
              onClick={() => setCallType(ct)}
              disabled={ct === "video" && !config.videoEnabled}
              style={{ ...s.toggle, ...(callType === ct ? s.toggleActive : {}) }}
            >
              {ct === "voice" ? "🎤 صوتی" : "📹 تصویری"}
            </button>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <p style={s.label}>جنسیت طرف مقابل</p>
        <div style={s.toggleRow}>
          {(["random", "male", "female"] as GenderFilter[]).map(gf => (
            <button
              key={gf}
              onClick={() => setGenderFilter(gf)}
              style={{ ...s.toggle, ...(genderFilter === gf ? s.toggleActive : {}) }}
            >
              {gf === "random" ? "🎲 شانسی" : gf === "male" ? "👦 پسر" : "👧 دختر"}
            </button>
          ))}
        </div>
      </div>

      <div style={s.costRow}>
        <span style={s.costLabel}>هزینه اتصال:</span>
        <span style={s.costValue}>🪙 {cost} سکه</span>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <button
        style={{ ...s.startBtn, ...(canCall ? {} : s.startBtnDisabled) }}
        onClick={() => canCall && onStart(callType, genderFilter)}
        disabled={!canCall}
      >
        {loading ? "در حال اتصال..." : canCall ? "🚀 شروع تماس" : `موجودی ناکافی (${cost} سکه لازم)`}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: "24px 16px", display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingBottom: "8px" },
  logo: { fontSize: "48px" },
  title: { fontSize: "22px", fontWeight: 700 },
  card: { background: "rgba(255,255,255,0.07)", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" },
  label: { fontSize: "13px", opacity: 0.65, textAlign: "right" },
  toggleRow: { display: "flex", gap: "8px" },
  toggle: { flex: 1, padding: "10px 0", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "inherit", fontSize: "14px", cursor: "pointer" },
  toggleActive: { background: "var(--tg-theme-button-color, #5865f2)", borderColor: "transparent", fontWeight: 600 },
  costRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" },
  costLabel: { fontSize: "14px", opacity: 0.7 },
  costValue: { fontWeight: 700, color: "#ffd700" },
  error: { background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,80,80,0.4)", borderRadius: "12px", padding: "12px", fontSize: "14px", color: "#ff9090", textAlign: "center" },
  startBtn: { padding: "16px", borderRadius: "16px", border: "none", background: "var(--tg-theme-button-color, #5865f2)", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer", marginTop: "auto" },
  startBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
};
