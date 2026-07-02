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

  // WebRTC signaling pass-through state
  const [peerOffer,  setPeerOffer]  = useState<string | undefined>();
  const [peerAnswer, setPeerAnswer] = useState<string | undefined>();
  const [peerCand,   setPeerCand]   = useState<RTCIceCandidateInit | undefined>();

  const sendRef = useRef<((msg: object) => void) | null>(null);

  const getInitData = (): string => {
    return (window as any).Telegram?.WebApp?.initData ?? "";
  };

  const apiHeaders = (): HeadersInit => ({
    "Content-Type":  "application/json",
    "x-init-data":   getInitData(),
  });

  // ── Fetch config + balance ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/config`,  { headers: apiHeaders() }).then(r => r.json()),
      fetch(`${API_BASE}/balance`, { headers: apiHeaders() }).then(r => r.json()),
    ]).then(([cfg, bal]) => {
      setConfig(cfg as Config);
      setCoins(bal.coins ?? 0);
    }).catch(() => setError("خطا در دریافت اطلاعات. لطفاً دوباره امتحان کنید."));
  }, []);

  // ── WS message handler ───────────────────────────────────────────────────
  const handleWsMessage = useCallback((msg: WsInMessage) => {
    switch (msg.type) {
      case "auth_ok":
        break;

      case "error": {
        setLoading(false);
        const codes: Record<string, string> = {
          insufficient_coins: `موجودی کافی نیست. نیاز به ${msg.required ?? "?"} سکه دارید.`,
          call_disabled:      "ویژگی تماس غیرفعال است.",
          video_disabled:     "تماس تصویری غیرفعال است.",
          already_in_call:    "شما در حال حاضر در یک تماس هستید.",
        };
        setError(codes[msg.code] ?? `خطا: ${msg.code}`);
        break;
      }

      case "queued":
        setLoading(false);
        setScreen("queue");
        break;

      case "left_queue":
        setScreen("home");
        break;

      case "matched":
        setLoading(false);
        setIceServers(msg.iceServers);
        setIsReceiver(msg.isReceiver ?? false);
        setCoinsSpent(msg.coinsDeducted);
        setCoins(msg.balance);
        setCallType(msg.callType);
        setScreen("call");
        break;

      case "offer":
        setPeerOffer(msg.sdp);
        break;

      case "answer":
        setPeerAnswer(msg.sdp);
        break;

      case "ice_candidate":
        setPeerCand(msg.candidate);
        break;

      case "partner_left":
      case "call_ended":
        setEndReason("partner_ended");
        setScreen("ended");
        break;

      case "force_end":
        setEndReason(msg.reason);
        setScreen("ended");
        break;
    }
  }, []);

  const { send } = useSignaling(handleWsMessage);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const startCall = useCallback((ct: CallType, gf: GenderFilter) => {
    setError(null);
    setLoading(true);
    setCallType(ct);
    send({ type: "join_queue", callType: ct, genderFilter: gf });
  }, [send]);

  const cancelQueue = useCallback(() => {
    send({ type: "leave_queue" });
    setScreen("home");
    setLoading(false);
  }, [send]);

  const endCall = useCallback((reason: string) => {
    setEndReason(reason);
    setScreen("ended");
    setPeerOffer(undefined);
    setPeerAnswer(undefined);
    setPeerCand(undefined);
  }, []);

  const startAgain = useCallback(async () => {
    setPeerOffer(undefined);
    setPeerAnswer(undefined);
    setPeerCand(undefined);
    setError(null);
    setScreen("home");
    // Refresh coins
    try {
      const bal = await fetch(`${API_BASE}/balance`, { headers: apiHeaders() }).then(r => r.json());
      setCoins(bal.coins ?? 0);
    } catch { /* ignore */ }
  }, []);

  // ── Spinner CSS animation ────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }, []);

  if (!config) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "40px" }}>📞</div>
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  if (!config.callEnabled) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px", padding: "24px", textAlign: "center" }}>
        <div style={{ fontSize: "48px" }}>🚫</div>
        <h2>ویژگی تماس ناشناس<br />در حال حاضر غیرفعال است</h2>
        <p style={{ opacity: 0.6, fontSize: "14px" }}>لطفاً بعداً دوباره امتحان کنید.</p>
      </div>
    );
  }

  switch (screen) {
    case "home":
      return (
        <HomeScreen
          config={config}
          coins={coins}
          onStart={startCall}
          loading={loading}
          error={error}
        />
      );
    case "queue":
      return <QueueScreen callType={callType} onCancel={cancelQueue} />;
    case "call":
      return (
        <CallScreen
          callType={callType}
          isReceiver={isReceiver}
          iceServers={iceServers}
          coinsSpent={coinsSpent}
          onSend={send}
          onEnded={endCall}
          peerOffer={peerOffer}
          peerAnswer={peerAnswer}
          peerCand={peerCand}
        />
      );
    case "ended":
      return <EndedScreen reason={endReason} onAgain={startAgain} />;
  }
}
