interface Props { coins: number; }

export function CoinBadge({ coins }: Props) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            "6px",
      background:     "rgba(255,215,0,0.12)",
      border:         "1px solid rgba(255,215,0,0.35)",
      borderRadius:   "20px",
      padding:        "6px 14px",
      fontSize:       "15px",
      fontWeight:     600,
      color:          "#ffd700",
    }}>
      🪙 {coins} سکه
    </div>
  );
}
