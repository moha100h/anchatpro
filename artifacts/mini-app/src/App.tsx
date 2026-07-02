import { useState, useEffect, useCallback, useRef } from "react";
import type { Config, CallType, GenderFilter, Screen, WsInMessage, IceServer } from "./types.js";
import { useSignaling } from "./hooks/useSignaling.js";
import { HomeScreen }   from "./screens/HomeScreen.js";
import { QueueScreen }  from "./screens/QueueScreen.js";
import { CallScreen }   from "./screens/CallScreen.js";
import { EndedScreen }  from "./screens/EndedScreen.js";

const API_BASE = "/api/call";

export default function App() {
  const [screen,      setScreen]      = useState<Screen>("home");
  const [config,      setConfig]      = useState<Config | null>(null);
  const [coins,       setCoins]       = useState(0);
  const [callType,    setCallType]    = useState<CallType>("voice");
  const [isReceiver,  setIsReceiver]  = useState(false);
  const [iceServers,  setIceServers]  = useState<IceServer[]>([]);
  const [coinsSpent,  setCoinsSpent]  = useState(0);
  const [endReason,   setEndReason]   = useState("user_ended");
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [peerOffer,   setPeerOffer]   = useState<string | undefined>();
  const [peerAnswer,  setPeerAnswer]  = useState<string | undefined>();
  // Array: accumulate ALL candidates so none are lost to React batching
  const [peerCands,   setPeerCands]   = useState<RTCIceCandidateInit[]>([]);

  const sendRef = useRef<((msg: object) => void) | null>(null);

  const getInitData = (): string =>
    (window as any).Telegram?.WebApp?.initData ?? "";

  const apiHeaders = (): HeadersInit => ({
    "Content-Type": "application/json",
    "x-init-data":  getInitData(),
  });

  useEffect(() => {
    // Config is public; balance is best-effort (returns 0 for unauthenticated)
    fetch(`${API_BASE}/config`, { headers: apiHeaders() })
      .then(r => r.json())
      .then(cfg => setConfig(cfg as Config))
      .catch(() => setConfig({ callEnabled: false } as any));

    fetch(`${API_BASE}/balance`, { headers: apiHeaders() })
      .then(r => r.json())
      .then(bal => setCoins(bal.coins ?? 0))
      .catch(() => setCoins(0));
  }, []);

  const handleWsMessage = useCallback((msg: WsInMessage) => {
    switch (msg.type) {
      case "auth_ok": break;
      case "error": {
        setLoading(false);
        const map: Record<string, string> = {
          insufficient_coins: `موجودی کافی نیست. نیاز به ${(msg as any).required ?? "?"} سکه.`,
          call_disabled:      "ویژگی تماس غیرفعال است.",
          video_disabled:     "تماس تصویری غیرفعال است.",
          already_in_call:    "شما در حال حاضر در یک تماس هستید.",
        };
        setError(map[(msg as any).code] ?? `خطا: ${(msg as any).code}`);
        break;
      }
      case "queued":       setLoading(false); setScreen("queue"); break;
      case "left_queue":   setScreen("home"); break;
      case "matched":
        setLoading(false);
        setIceServers((msg as any).iceServers);
        setIsReceiver((msg as any).isReceiver ?? false);
        setCoinsSpent((msg as any).coinsDeducted);
        setCoins((msg as any).balance);
        setCallType((msg as any).callType);
        setScreen("call");
        break;
      case "offer":         setPeerOffer((msg as any).sdp);  break;
      case "answer":        setPeerAnswer((msg as any).sdp); break;
      case "ice_candidate": setPeerCands(prev => [...prev, (msg as any).candidate]); break;
      case "partner_left":
      case "call_ended":    setEndReason("partner_ended"); setScreen("ended"); break;
      case "force_end":     setEndReason((msg as any).reason); setScreen("ended"); break;
    }
  }, []);

  const { send } = useSignaling(handleWsMessage);
  useEffect(() => { sendRef.current = send; }, [send]);

  const startCall = useCallback((ct: CallType, gf: GenderFilter) => {
    setError(null); setLoading(true); setCallType(ct);
    send({ type: "join_queue", callType: ct, genderFilter: gf });
  }, [send]);

  const cancelQueue = useCallback(() => {
    send({ type: "leave_queue" });
    setScreen("home"); setLoading(false);
  }, [send]);

  const endCall = useCallback((reason: string) => {
    setEndReason(reason); setScreen("ended");
    setPeerOffer(undefined); setPeerAnswer(undefined); setPeerCands([]);
  }, []);

  const startAgain = useCallback(async () => {
    setPeerOffer(undefined); setPeerAnswer(undefined); setPeerCands([]);
    setError(null); setScreen("home");
    try {
      const bal = await fetch(`${API_BASE}/balance`, { headers: apiHeaders() }).then(r => r.json());
      setCoins(bal.coins ?? 0);
    } catch { /* ignore */ }
  }, []);

  if (!config) {
    return (
      <div style={center}>
        <div style={loadRing} />
        <p style={{ fontSize: "14px", color: "var(--muted, rgba(240,240,245,0.45))", marginTop: "20px" }}>
          در حال بارگذاری...
        </p>
      </div>
    );
  }

  if (!config.callEnabled) {
    return (
      <div style={{ ...center, gap: "16px", padding: "32px 24px", textAlign: "center" }}>
        <span style={{ fontSize: "56px" }}>🚫</span>
        <h2 style={{ fontSize: "18px", fontWeight: 700 }}>ویژگی تماس ناشناس<br />در حال حاضر غیرفعال است</h2>
        <p style={{ fontSize: "14px", color: "var(--muted, rgba(240,240,245,0.45))", maxWidth: "240px" }}>
          لطفاً بعداً دوباره امتحان کنید.
        </p>
      </div>
    );
  }

  switch (screen) {
    case "home":
      return <HomeScreen config={config} coins={coins} onStart={startCall} loading={loading} error={error} />;
    case "queue":
      return <QueueScreen callType={callType} onCancel={cancelQueue} />;
    case "call":
      return (
        <CallScreen
          callType={callType} isReceiver={isReceiver} iceServers={iceServers}
          coinsSpent={coinsSpent} onSend={send} onEnded={endCall}
          peerOffer={peerOffer} peerAnswer={peerAnswer} peerCands={peerCands}
        />
      );
    case "ended":
      return <EndedScreen reason={endReason} onAgain={startAgain} />;
  }
}

const center: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
};

const loadRing: React.CSSProperties = {
  width: "48px", height: "48px", borderRadius: "50%",
  border: "3px solid rgba(124,58,237,0.15)",
  borderTop: "3px solid #7c3aed",
  animation: "spin .8s linear infinite",
};
