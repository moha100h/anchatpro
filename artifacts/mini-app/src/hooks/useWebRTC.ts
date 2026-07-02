import { useRef, useCallback, useEffect } from "react";
import type { IceServer } from "../types.js";

interface Opts {
  iceServers:      IceServer[];
  localRef:        React.RefObject<HTMLVideoElement | null>;
  remoteRef:       React.RefObject<HTMLVideoElement | null>;
  remoteAudioRef?: React.RefObject<HTMLAudioElement | null>;
  callType:        "voice" | "video";
  isReceiver:      boolean;
  onIceCand:       (cand: RTCIceCandidateInit) => void;
  onOffer:         (sdp: string) => void;
  onAnswer:        (sdp: string) => void;
  onReady:         () => void;
  onEnded:         (reason: string) => void;
  onStream?:       (stream: MediaStream) => void;
}

export function useWebRTC(opts: Opts) {
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  // Dedicated stream for collecting ALL remote tracks (handles iOS bug where ev.streams is empty)
  const remoteStreamRef  = useRef<MediaStream | null>(null);
  const iceCandQueueRef  = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef  = useRef<string | null>(null);
  const remoteDescSetRef = useRef(false);
  const readyFiredRef    = useRef(false);
  const isClosingRef     = useRef(false);
  const optsRef          = useRef(opts);
  optsRef.current = opts;

  const fireReady = useCallback(() => {
    if (!readyFiredRef.current) {
      readyFiredRef.current = true;
      optsRef.current.onReady();
    }
  }, []);

  /** Attach a MediaStream to a media element and force play (required on iOS WKWebView) */
  const attachStream = useCallback((el: HTMLVideoElement | HTMLAudioElement | null, stream: MediaStream) => {
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    // Explicit play() is required on iOS — autoPlay alone does not work in WKWebView
    el.play().catch(() => { /* ignore NotAllowedError / NotSupportedError */ });
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
      // ── Collect remote tracks into a persistent stream ──────────────────
      // On iOS Safari / WKWebView, ev.streams can be empty — so we collect
      // tracks manually into our own MediaStream to be safe.
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      const rs = remoteStreamRef.current;

      // Add the incoming track (guard against duplicates)
      if (ev.track && !rs.getTracks().includes(ev.track)) {
        rs.addTrack(ev.track);
      }
      // Also pull in any tracks from ev.streams (standard browsers)
      ev.streams?.[0]?.getTracks().forEach(t => {
        if (!rs.getTracks().includes(t)) rs.addTrack(t);
      });

      // Attach to video element (video calls) and audio element (voice calls)
      attachStream(optsRef.current.remoteRef.current, rs);
      const audioEl = optsRef.current.remoteAudioRef?.current ?? null;
      attachStream(audioEl, rs);

      fireReady();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) optsRef.current.onIceCand(ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") fireReady();
      if (state === "failed" && !isClosingRef.current) {
        optsRef.current.onEnded("connection_failed");
      }
      // "closed" is intentional (cleanup) — do NOT fire onEnded
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") fireReady();
      if (s === "failed" && !isClosingRef.current) {
        optsRef.current.onEnded("connection_failed");
      }
    };
  }, [fireReady, attachStream]);

  const cleanup = useCallback(() => {
    isClosingRef.current = true;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    remoteStreamRef.current = null;
    iceCandQueueRef.current = [];
    pendingOfferRef.current = null;
    remoteDescSetRef.current = false;
    readyFiredRef.current = false;
  }, []);

  const start = useCallback(async () => {
    isClosingRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: optsRef.current.callType === "video",
      });
    } catch {
      optsRef.current.onEnded("connection_failed");
      return;
    }

    streamRef.current = stream;
    optsRef.current.onStream?.(stream);

    const localEl = optsRef.current.localRef.current;
    if (localEl) {
      localEl.srcObject = stream;
      localEl.play().catch(() => {});
    }

    const pc = new RTCPeerConnection({
      iceServers: optsRef.current.iceServers as RTCIceServer[],
      iceTransportPolicy: "all",
    });
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    setupPC(pc);

    if (!optsRef.current.isReceiver) {
      // Caller: create offer — no legacy offerToReceive* flags (addTrack implies sendrecv)
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        optsRef.current.onOffer(offer.sdp!);
      } catch { optsRef.current.onEnded("connection_failed"); }
    } else if (pendingOfferRef.current) {
      // Receiver: offer arrived before PC was ready
      const sdp = pendingOfferRef.current;
      pendingOfferRef.current = null;
      try {
        await pc.setRemoteDescription({ type: "offer", sdp });
        remoteDescSetRef.current = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        optsRef.current.onAnswer(answer.sdp!);
        await drainIceCandidates();
      } catch { optsRef.current.onEnded("connection_failed"); }
    }
  }, [setupPC, drainIceCandidates]);

  const handleOffer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) {
      pendingOfferRef.current = sdp;
      return;
    }
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      remoteDescSetRef.current = true;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      optsRef.current.onAnswer(answer.sdp!);
      await drainIceCandidates();
    } catch { /* ignore */ }
  }, [drainIceCandidates]);

  const handleAnswer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp });
      remoteDescSetRef.current = true;
      await drainIceCandidates();
    } catch { /* ignore */ }
  }, [drainIceCandidates]);

  const handleIceCandidate = useCallback(async (cand: RTCIceCandidateInit) => {
    if (!remoteDescSetRef.current || !pcRef.current) {
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
