interface Props { coins: number; }

export function CoinBadge({ coins }: Props) {
  return (
    <div style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          "5px",
      background:   "rgba(251,191,36,0.12)",
      border:       "1px solid rgba(251,191,36,0.3)",
      borderRadius: "100px",
      padding:      "5px 14px",
      fontSize:     "14px",
      fontWeight:   700,
      color:        "#fbbf24",
      letterSpacing: "0.3px",
    }}>
      🪙 {coins}
    </div>
  );
}
