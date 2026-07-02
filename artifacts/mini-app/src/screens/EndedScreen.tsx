interface Props { reason: string; onAgain: () => void; }

const REASONS: Record<string, { icon: string; msg: string }> = {
  user_ended:           { icon: "📵", msg: "تماس توسط شما پایان یافت." },
  partner_ended:        { icon: "👋", msg: "طرف مقابل تماس را قطع کرد." },
  partner_disconnected: { icon: "📡", msg: "اتصال طرف مقابل قطع شد." },
  max_duration_reached: { icon: "⏰", msg: "مدت مجاز تماس به پایان رسید." },
  connection_failed:    { icon: "🔴", msg: "اتصال برقرار نشد. دوباره امتحان کنید." },
};

export function EndedScreen({ reason, onAgain }: Props) {
  const { icon, msg } = REASONS[reason] ?? { icon: "📵", msg: "تماس به پایان رسید." };
  return (
    <div style={s.page}>
      <div style={s.card}>
        <span style={s.icon}>{icon}</span>
        <h2 style={s.title}>تماس پایان یافت</h2>
        <p style={s.msg}>{msg}</p>
      </div>
      <button style={s.btn} onClick={onAgain}>
        🔄  تماس مجدد
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: "28px", padding: "32px 20px",
    animation: "fadeUp .35s ease both",
  },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px", padding: "36px 28px", width: "100%", maxWidth: "320px",
  },
  icon:  { fontSize: "60px", animation: "scalePop .4s ease" },
  title: { fontSize: "20px", fontWeight: 700 },
  msg:   { fontSize: "14px", color: "var(--muted)", textAlign: "center", lineHeight: "1.6", maxWidth: "240px" },
  btn: {
    padding: "16px 48px", borderRadius: "18px", border: "none",
    background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff",
    fontSize: "16px", fontWeight: 700, cursor: "pointer",
    boxShadow: "0 8px 32px rgba(124,58,237,0.4)",
  },
};
