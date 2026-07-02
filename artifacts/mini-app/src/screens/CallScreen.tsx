import { useEffect, useRef, useState } from "react";
import type { IceServer } from "../types.js";
import { useWebRTC } from "../hooks/useWebRTC.js";

interface Props {
  callType:    "voice" | "video";
  isReceiver:  boolean;
  iceServers:  IceServer[];
  onSend:      (msg: object) => void;
  onEnded:     (reason: string) => void;
  peerOffer?:  string;
  peerAnswer?: string;
  peerCands?:  RTCIceCandidateInit[];
  coinsSpent:  number;
}

const BAR_COUNT = 7;

export function CallScreen(props: Props) {
  const localRef  = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const [duration,   setDuration]   = useState(0);
  const [connected,  setConnected]  = useState(false);
  const [muted,      setMuted]      = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const { start, handleOffer, handleAnswer, handleIceCandidate, cleanup } = useWebRTC({
    iceServers:  props.iceServers,
    localRef,
    remoteRef,
    callType:    props.callType,
    isReceiver:  props.isReceiver,
    onIceCand:   (c) => props.onSend({ type: "ice_candidate", candidate: c }),
    onOffer:     (s) => props.onSend({ type: "offer",  sdp: s }),
    onAnswer:    (s) => props.onSend({ type: "answer", sdp: s }),
    onReady:     ()  => setConnected(true),
    onEnded:     (r) => props.onEnded(r),
    onStream:    (s) => { streamRef.current = s; },
  });

  // Track how many peerCands we've already processed (avoids re-processing)
  const processedCandsRef = useRef(0);

  useEffect(() => { start(); return () => cleanup(); }, []);
  useEffect(() => { if (props.peerOffer)  handleOffer(props.peerOffer);  }, [props.peerOffer]);
  useEffect(() => { if (props.peerAnswer) handleAnswer(props.peerAnswer); }, [props.peerAnswer]);

  // Process only newly arrived ICE candidates (never skip, never double-process)
  useEffect(() => {
    const cands = props.peerCands ?? [];
    const newOnes = cands.slice(processedCandsRef.current);
    processedCandsRef.current = cands.length;
    newOnes.forEach(c => handleIceCandidate(c));
  }, [props.peerCands]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const mm  = String(Math.floor(duration / 60)).padStart(2, "0");
  const ss  = String(duration % 60).padStart(2, "0");

  const endCall = () => {
    cleanup();
    props.onSend({ type: "call_end" });
    props.onEnded("user_ended");
  };

  const toggleMute = () => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  };

  if (props.callType === "video") {
    return (
      <div style={sv.wrap}>
        <video ref={remoteRef as any} autoPlay playsInline style={sv.remote} />
        <video ref={localRef  as any} autoPlay playsInline muted style={sv.local} />

        <div style={sv.overlay}>
          <div style={sv.topBar}>
            {connected
              ? <div style={sv.statusOn}><span style={sv.dot} /> {mm}:{ss}</div>
              : <div style={sv.statusWait}>⏳ در حال اتصال...</div>}
            <div style={sv.coinsBadge}>🪙 {props.coinsSpent}</div>
          </div>

          <div style={sv.controls}>
            <button style={sv.ctrlBtn} onClick={toggleMute}>
              {muted ? "🔇" : "🎙️"}
            </button>
            <button style={sv.endBtn} onClick={endCall}>📵</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Voice call ──────────────────────────────────────────────────────────
  return (
    <div style={voiceS.page}>
      <div style={voiceS.topBar}>
        {connected
          ? <div style={voiceS.statusOn}><span style={voiceS.dot} /> در تماس</div>
          : <div style={voiceS.statusWait}>⏳ در حال اتصال...</div>}
        <div style={voiceS.coinsBadge}>🪙 {props.coinsSpent} کسر شد</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "32px" }}>
        <div style={voiceS.avatarWrap}>
          <div style={voiceS.avatar}>👤</div>
          {connected && <div style={voiceS.avatarRing} />}
        </div>

        <div style={voiceS.timer}>{mm}:{ss}</div>

        {/* Equalizer bars */}
        {connected && (
          <div style={voiceS.eq}>
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <div key={i} style={{ ...voiceS.bar, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
      </div>

      <div style={voiceS.controls}>
        <button style={voiceS.ctrlBtn} onClick={toggleMute}>
          <span style={voiceS.ctrlIcon}>{muted ? "🔇" : "🎙️"}</span>
          <span style={voiceS.ctrlLbl}>{muted ? "بی‌صدا" : "میکروفون"}</span>
        </button>
        <button style={voiceS.endCircle} onClick={endCall}>
          <span style={{ fontSize: "28px" }}>📵</span>
        </button>
        <button style={voiceS.ctrlBtn}>
          <span style={voiceS.ctrlIcon}>🔊</span>
          <span style={voiceS.ctrlLbl}>بلندگو</span>
        </button>
      </div>
    </div>
  );
}

// Video styles
const sv: Record<string, React.CSSProperties> = {
  wrap:       { position: "relative", width: "100%", height: "100vh", background: "#000", overflow: "hidden" },
  remote:     { width: "100%", height: "100%", objectFit: "cover" },
  local:      { position: "absolute", top: "16px", left: "16px", width: "110px", height: "155px", objectFit: "cover", borderRadius: "14px", border: "2px solid rgba(255,255,255,0.25)", zIndex: 2 },
  overlay:    { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "16px 20px 32px", zIndex: 3 },
  topBar:     { display: "flex", justifyContent: "space-between", alignItems: "center", alignSelf: "flex-end", width: "100%", marginTop: "8px" },
  statusOn:   { display: "flex", alignItems: "center", gap: "6px", fontSize: "16px", fontWeight: 700, background: "rgba(0,0,0,0.4)", borderRadius: "20px", padding: "6px 14px", backdropFilter: "blur(8px)" },
  statusWait: { fontSize: "15px", background: "rgba(0,0,0,0.4)", borderRadius: "20px", padding: "6px 14px", backdropFilter: "blur(8px)" },
  dot:        { width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" },
  coinsBadge: { fontSize: "13px", fontWeight: 700, background: "rgba(0,0,0,0.4)", borderRadius: "20px", padding: "5px 12px", color: "#fbbf24", backdropFilter: "blur(8px)" },
  controls:   { display: "flex", justifyContent: "center", alignItems: "center", gap: "20px" },
  ctrlBtn:    { width: "56px", height: "56px", borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "22px", cursor: "pointer", backdropFilter: "blur(8px)" },
  endBtn:     { width: "70px", height: "70px", borderRadius: "50%", border: "none", background: "var(--danger,#ef4444)", color: "#fff", fontSize: "28px", cursor: "pointer" },
};

// Voice styles
const voiceS: Record<string, React.CSSProperties> = {
  page:       { minHeight: "100vh", display: "flex", flexDirection: "column", padding: "20px 20px 36px", animation: "fadeUp .35s ease both" },
  topBar:     { display: "flex", justifyContent: "space-between", alignItems: "center" },
  statusOn:   { display: "flex", alignItems: "center", gap: "6px", fontSize: "15px", fontWeight: 600 },
  statusWait: { fontSize: "14px", color: "var(--muted)" },
  dot:        { width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 8px rgba(16,185,129,0.7)" },
  coinsBadge: { fontSize: "13px", fontWeight: 600, color: "var(--gold)", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "20px", padding: "4px 12px" },
  avatarWrap: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center" },
  avatar: {
    width: "120px", height: "120px", borderRadius: "50%",
    background: "linear-gradient(135deg,rgba(124,58,237,0.25),rgba(37,99,235,0.25))",
    border: "1px solid rgba(124,58,237,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "52px",
  },
  avatarRing: {
    position: "absolute", inset: "-12px", borderRadius: "50%",
    border: "2px solid rgba(124,58,237,0.4)",
    animation: "pulsering 2s ease-out infinite",
  },
  timer:  { fontSize: "52px", fontWeight: 800, letterSpacing: "4px", fontVariantNumeric: "tabular-nums", color: "#fff" },
  eq: { display: "flex", gap: "5px", alignItems: "flex-end", height: "36px" },
  bar: {
    width: "5px", borderRadius: "3px",
    background: "linear-gradient(to top,#7c3aed,#2563eb)",
    animation: "wave 0.8s ease-in-out infinite",
    transformOrigin: "bottom",
    height: "100%",
  },
  controls:   { display: "flex", justifyContent: "center", alignItems: "center", gap: "20px" },
  ctrlBtn:    { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px", padding: "14px 20px", color: "var(--text)", cursor: "pointer" },
  ctrlIcon:   { fontSize: "24px" },
  ctrlLbl:    { fontSize: "11px", color: "var(--muted)", fontWeight: 600 },
  endCircle:  { width: "72px", height: "72px", borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(239,68,68,0.5)" },
};
