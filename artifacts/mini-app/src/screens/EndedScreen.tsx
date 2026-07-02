interface Props {
  reason:  string;
  onAgain: () => void;
}

const REASON_LABELS: Record<string, string> = {
  user_ended:          "تماس توسط شما قطع شد.",
  partner_ended:       "طرف مقابل تماس را قطع کرد.",
  partner_disconnected:"اتصال طرف مقابل قطع شد.",
  max_duration_reached:"مدت تماس به پایان رسید.",
  connection_failed:   "اتصال برقرار نشد.",
};

export function EndedScreen({ reason, onAgain }: Props) {
  return (
    <div style={s.wrap}>
      <span style={s.icon}>📵</span>
      <h2 style={s.title}>تماس پایان یافت</h2>
      <p style={s.reason}>{REASON_LABELS[reason] ?? "تماس به پایان رسید."}</p>
      <button style={s.btn} onClick={onAgain}>🔄 تماس مجدد</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap:   { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px 20px" },
  icon:   { fontSize: "64px" },
  title:  { fontSize: "22px", fontWeight: 700 },
  reason: { fontSize: "15px", opacity: 0.65, textAlign: "center", maxWidth: "280px" },
  btn:    { marginTop: "16px", padding: "14px 40px", borderRadius: "16px", border: "none", background: "var(--tg-theme-button-color, #5865f2)", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
};
