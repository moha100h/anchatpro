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
  peerCand?:   RTCIceCandidateInit;
  coinsSpent:  number;
}

export function CallScreen(props: Props) {
  const localRef  = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [connected, setConnected] = useState(false);

  const { start, handleOffer, handleAnswer, handleIceCandidate, cleanup } = useWebRTC({
    iceServers:  props.iceServers,
    localRef,
    remoteRef,
    callType:    props.callType,
    isReceiver:  props.isReceiver,
    onIceCand:   (cand) => props.onSend({ type: "ice_candidate", candidate: cand }),
    onOffer:     (sdp)  => props.onSend({ type: "offer", sdp }),
    onAnswer:    (sdp)  => props.onSend({ type: "answer", sdp }),
    onReady:     ()     => { setConnected(true); props.onSend({ type: "call_ready" }); },
    onEnded:     (r)    => props.onEnded(r),
  });

  useEffect(() => { start(); return () => cleanup(); }, []);

  useEffect(() => {
    if (props.peerOffer)  handleOffer(props.peerOffer);
  }, [props.peerOffer]);

  useEffect(() => {
    if (props.peerAnswer) handleAnswer(props.peerAnswer);
  }, [props.peerAnswer]);

  useEffect(() => {
    if (props.peerCand)   handleIceCandidate(props.peerCand);
  }, [props.peerCand]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const mm = String(Math.floor(duration / 60)).padStart(2, "0");
  const ss = String(duration % 60).padStart(2, "0");

  const endCall = () => {
    cleanup();
    props.onSend({ type: "call_end" });
    props.onEnded("user_ended");
  };

  return (
    <div style={s.wrap}>
      {props.callType === "video" && (
        <div style={s.videoWrap}>
          <video ref={remoteRef as any} autoPlay playsInline style={s.remoteVideo} />
          <video ref={localRef  as any} autoPlay playsInline muted style={s.localVideo} />
        </div>
      )}
      <div style={s.info}>
        <div style={s.status}>
          {connected ? <><span style={s.dot} /> در تماس</> : "⏳ در حال اتصال..."}
        </div>
        {connected && <div style={s.timer}>{mm}:{ss}</div>}
        <div style={s.coins}>🪙 {props.coinsSpent} سکه کسر شد</div>
      </div>
      {props.callType === "voice" && (
        <div style={s.voiceAvatar}>🎙️</div>
      )}
      <button style={s.endBtn} onClick={endCall}>📵 پایان تماس</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap:        { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "24px 20px", gap: "20px" },
  videoWrap:   { position: "relative", width: "100%", flex: 1, borderRadius: "20px", overflow: "hidden", background: "#000", minHeight: "280px" },
  remoteVideo: { width: "100%", height: "100%", objectFit: "cover" },
  localVideo:  { position: "absolute", bottom: "12px", right: "12px", width: "100px", height: "140px", objectFit: "cover", borderRadius: "12px", border: "2px solid rgba(255,255,255,0.3)" },
  info:        { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" },
  status:      { display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: 600 },
  dot:         { width: "10px", height: "10px", borderRadius: "50%", background: "#00e676", display: "inline-block" },
  timer:       { fontSize: "32px", fontWeight: 700, letterSpacing: "2px", fontVariantNumeric: "tabular-nums" },
  coins:       { fontSize: "13px", opacity: 0.6 },
  voiceAvatar: { fontSize: "80px" },
  endBtn:      { width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: "rgba(255,60,60,0.85)", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
};
