import { useRef, useCallback, useEffect } from "react";
import type { IceServer } from "../types.js";

interface Opts {
  iceServers:   IceServer[];
  localRef:     React.RefObject<HTMLVideoElement | null>;
  remoteRef:    React.RefObject<HTMLVideoElement | null>;
  callType:     "voice" | "video";
  isReceiver:   boolean;
  onIceCand:    (cand: RTCIceCandidateInit) => void;
  onOffer:      (sdp: string) => void;
  onAnswer:     (sdp: string) => void;
  onReady:      () => void;
  onEnded:      (reason: string) => void;
  onStream?:    (stream: MediaStream) => void;
}

export function useWebRTC(opts: Opts) {
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  // Queue ICE candidates that arrive before remote description is set
  const iceCandQueueRef  = useRef<RTCIceCandidateInit[]>([]);
  // Store offer that arrives before PC is created (race condition fix)
  const pendingOfferRef  = useRef<string | null>(null);
  const remoteDescSetRef = useRef(false);
  const readyFiredRef    = useRef(false);
  // Use ref for opts to avoid stale closures without re-creating callbacks
  const optsRef          = useRef(opts);
  optsRef.current = opts;

  const fireReady = useCallback(() => {
    if (!readyFiredRef.current) {
      readyFiredRef.current = true;
      optsRef.current.onReady();
    }
  }, []);

  const drainIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queue = [...iceCandQueueRef.current];
    iceCandQueueRef.current = [];
    for (const cand of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ignore */ }
    }
  }, []);

  const setupPC = useCallback((pc: RTCPeerConnection) => {
    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (optsRef.current.remoteRef.current && remoteStream) {
        optsRef.current.remoteRef.current.srcObject = remoteStream;
      }
      fireReady();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) optsRef.current.onIceCand(ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") fireReady();
      if (state === "failed" || state === "closed") {
        optsRef.current.onEnded("connection_failed");
      }
    };

    // Additional fallback: ICE connection state
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") fireReady();
      if (s === "failed") optsRef.current.onEnded("connection_failed");
    };
  }, [fireReady]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    iceCandQueueRef.current = [];
    pendingOfferRef.current = null;
    remoteDescSetRef.current = false;
    readyFiredRef.current = false;
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: optsRef.current.callType === "video",
    });
    streamRef.current = stream;
    optsRef.current.onStream?.(stream);

    if (optsRef.current.localRef.current) {
      optsRef.current.localRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection({
      iceServers: optsRef.current.iceServers as RTCIceServer[],
    });
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    setupPC(pc);

    if (!optsRef.current.isReceiver) {
      // Caller: create and send offer immediately
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      optsRef.current.onOffer(offer.sdp!);
    } else if (pendingOfferRef.current) {
      // Receiver: offer arrived before PC was ready — process it now
      const sdp = pendingOfferRef.current;
      pendingOfferRef.current = null;
      await pc.setRemoteDescription({ type: "offer", sdp });
      remoteDescSetRef.current = true;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      optsRef.current.onAnswer(answer.sdp!);
      await drainIceCandidates();
    }
  }, [setupPC, drainIceCandidates]);

  const handleOffer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) {
      // PC not created yet (getUserMedia still running) — queue for start()
      pendingOfferRef.current = sdp;
      return;
    }
    await pc.setRemoteDescription({ type: "offer", sdp });
    remoteDescSetRef.current = true;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    optsRef.current.onAnswer(answer.sdp!);
    await drainIceCandidates();
  }, [drainIceCandidates]);

  const handleAnswer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "answer", sdp });
    remoteDescSetRef.current = true;
    await drainIceCandidates();
  }, [drainIceCandidates]);

  const handleIceCandidate = useCallback(async (cand: RTCIceCandidateInit) => {
    if (!remoteDescSetRef.current || !pcRef.current) {
      // Remote description not set yet — queue until after setRemoteDescription
      iceCandQueueRef.current.push(cand);
      return;
    }
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
    } catch { /* ignore stale candidates */ }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return { start, handleOffer, handleAnswer, handleIceCandidate, cleanup };
}
