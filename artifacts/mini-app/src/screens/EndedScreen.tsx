import { useState, useEffect } from "react";
import { translations } from "../i18n.js";
import type { Lang } from "../i18n.js";

interface Props { lang: Lang; reason: string; onAgain: () => void; }

const COUNTDOWN = 8;

export function EndedScreen({ lang, reason, onAgain }: Props) {
  const t = translations[lang];
  const { icon, msg } = t.reasons[reason] ?? { icon: "📵", msg: t.reasons["user_ended"]?.msg ?? "" };
  const [secs, setSecs] = useState(COUNTDOWN);

  // Countdown timer — auto-suggests reconnect
  useEffect(() => {
    if (secs <= 0) { onAgain(); return; }
    const id = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secs, onAgain]);

  const pct = (secs / COUNTDOWN) * 100;

  return (
    <div style={s.page}>
      {/* Quick reconnect suggestion — top of screen */}
      <div style={s.reconnectCard}>
        <p style={s.reconnectHint}>{t.endedReconnectHint}</p>
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${pct}%` }} />
        </div>
        <button style={s.reconnectBtn} onClick={onAgain}>
          {t.endedAgain} <span style={s.countdown}>{secs}</span>
        </button>
        <button style={s.dismissBtn} onClick={() => setSecs(-1)}>
          {t.endedDismiss}
        </button>
      </div>

      {/* Call ended info */}
      <div style={s.card}>
        <span style={s.icon}>{icon}</span>
        <h2 style={s.title}>{t.endedTitle}</h2>
        <p style={s.msg}>{msg}</p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: "24px", padding: "32px 20px",
    animation: "fadeUp .35s ease both",
  },
  reconnectCard: {
    width: "100%", maxWidth: "340px",
    background: "linear-gradient(135deg,rgba(124,58,237,0.18),rgba(37,99,235,0.18))",
    border: "1px solid rgba(124,58,237,0.35)",
    borderRadius: "24px", padding: "22px 20px 18px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
  },
  reconnectHint: { fontSize: "14px", color: "var(--muted)", textAlign: "center", margin: 0 },
  progressWrap: { width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" },
  progressBar:  { height: "100%", background: "linear-gradient(90deg,#7c3aed,#2563eb)", borderRadius: "4px", transition: "width 1s linear" },
  reconnectBtn: {
    width: "100%", padding: "15px 0", borderRadius: "16px", border: "none",
    background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff",
    fontSize: "17px", fontWeight: 700, cursor: "pointer",
    boxShadow: "0 8px 32px rgba(124,58,237,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
  },
  countdown: {
    background: "rgba(255,255,255,0.2)", borderRadius: "8px",
    padding: "2px 9px", fontSize: "14px", fontWeight: 800, minWidth: "28px", textAlign: "center",
  },
  dismissBtn: {
    background: "none", border: "none", color: "var(--muted)",
    fontSize: "13px", cursor: "pointer", padding: "4px 8px",
  },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px", padding: "32px 28px", width: "100%", maxWidth: "340px",
  },
  icon:  { fontSize: "52px", animation: "scalePop .4s ease" },
  title: { fontSize: "20px", fontWeight: 700, margin: 0 },
  msg:   { fontSize: "14px", color: "var(--muted)", textAlign: "center", lineHeight: "1.6", maxWidth: "240px", margin: 0 },
};
