interface Props {
  callType: "voice" | "video";
  onCancel: () => void;
}

export function QueueScreen({ callType, onCancel }: Props) {
  return (
    <div style={s.wrap}>
      <div style={s.iconWrap}>
        <div style={s.spinner} />
        <span style={s.icon}>{callType === "video" ? "📹" : "🎤"}</span>
      </div>
      <h2 style={s.title}>در حال جستجو...</h2>
      <p style={s.sub}>در حال پیدا کردن طرف مقابل هستیم. لطفاً صبر کنید.</p>
      <button style={s.cancelBtn} onClick={onCancel}>❌ انصراف</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "32px 20px" },
  iconWrap: { position: "relative", width: "100px", height: "100px" },
  spinner: {
    position: "absolute", inset: 0, borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTop: "3px solid var(--tg-theme-button-color, #5865f2)",
    animation: "spin 1s linear infinite",
  },
  icon: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: "40px" },
  title: { fontSize: "22px", fontWeight: 700 },
  sub: { fontSize: "14px", opacity: 0.6, textAlign: "center", maxWidth: "260px" },
  cancelBtn: { marginTop: "24px", padding: "12px 32px", borderRadius: "16px", border: "1px solid rgba(255,80,80,0.5)", background: "rgba(255,80,80,0.1)", color: "#ff9090", fontSize: "15px", cursor: "pointer" },
};
