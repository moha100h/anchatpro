import { translations } from "../i18n.js";
import type { Lang } from "../i18n.js";

interface Props { lang: Lang; callType: "voice" | "video"; onCancel: () => void; }

export function QueueScreen({ lang, callType, onCancel }: Props) {
  const t = translations[lang];
  return (
    <div style={s.page}>
      <div style={s.pulseWrap}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ ...s.ring, animationDelay: `${(i - 1) * 0.45}s` }} />
        ))}
        <div style={s.iconCircle}>
          <span style={s.icon}>{callType === "video" ? "📹" : "🎤"}</span>
        </div>
      </div>

      <div style={s.textWrap}>
        <h2 style={s.title}>
          {t.queueSearching}
          <span style={{ ...s.dot, animationDelay: "0s"   }}>.</span>
          <span style={{ ...s.dot, animationDelay: ".3s"  }}>.</span>
          <span style={{ ...s.dot, animationDelay: ".6s"  }}>.</span>
        </h2>
        <p style={s.sub}>
          {callType === "video" ? t.queueSubVideo : t.queueSubVoice}
        </p>
      </div>

      <div style={s.hint}>
        <span style={s.hintDot} />
        <span>{t.queueSecure}</span>
      </div>

      <button style={s.cancelBtn} onClick={onCancel}>
        {t.queueCancel}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: "36px", padding: "32px 20px",
    animation: "fadeUp .35s ease both",
  },
  pulseWrap: {
    position: "relative", width: "160px", height: "160px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  ring: {
    position: "absolute", inset: 0, borderRadius: "50%",
    border: "2px solid rgba(124,58,237,0.6)",
    animation: "pulsering 1.8s ease-out infinite",
  },
  iconCircle: {
    position: "relative", zIndex: 2,
    width: "80px", height: "80px", borderRadius: "50%",
    background: "linear-gradient(135deg,rgba(124,58,237,0.3),rgba(37,99,235,0.3))",
    border: "1px solid rgba(124,58,237,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(8px)",
  },
  icon: { fontSize: "34px" },
  textWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" },
  title: { fontSize: "22px", fontWeight: 700, display: "flex", alignItems: "baseline" },
  dot: {
    display: "inline-block", animation: "glow 1.2s ease-in-out infinite",
    fontSize: "24px", marginLeft: "1px",
  },
  sub: { fontSize: "14px", color: "var(--muted)", textAlign: "center", maxWidth: "260px", lineHeight: "1.6" },
  hint: {
    display: "flex", alignItems: "center", gap: "8px",
    fontSize: "12px", color: "var(--muted)",
  },
  hintDot: {
    width: "7px", height: "7px", borderRadius: "50%",
    background: "var(--success)", boxShadow: "0 0 8px rgba(16,185,129,0.6)",
  },
  cancelBtn: {
    padding: "12px 36px", borderRadius: "100px",
    border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)",
    color: "#fca5a5", fontSize: "15px", fontWeight: 600, cursor: "pointer",
    transition: "all .2s",
  },
};
