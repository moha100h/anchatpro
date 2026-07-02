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
  const iceCandQueueRef  = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef  = useRef<string | null>(null);
  const remoteDescSetRef = useRef(false);
  const readyFiredRef    = useRef(false);
  // Prevent false onEnded when PC is closed intentionally (cleanup/unmount)
  const isClosingRef     = useRef(false);
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
      const stream = ev.streams[0] ?? new MediaStream(ev.track ? [ev.track] : []);
      // Video element (video calls)
      if (optsRef.current.remoteRef.current && stream) {
        optsRef.current.remoteRef.current.srcObject = stream;
      }
      // Audio element (voice calls — hidden <audio> element)
      if (optsRef.current.remoteAudioRef?.current && stream) {
        optsRef.current.remoteAudioRef.current.srcObject = stream;
      }
      fireReady();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) optsRef.current.onIceCand(ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") fireReady();
      // Only end on "failed" — NOT on "closed" (that fires during intentional cleanup)
      if (state === "failed" && !isClosingRef.current) {
        optsRef.current.onEnded("connection_failed");
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "connected" || s === "completed") fireReady();
      // "disconnected" is transient; "failed" is permanent
      if (s === "failed" && !isClosingRef.current) {
        optsRef.current.onEnded("connection_failed");
      }
    };
  }, [fireReady]);

  const cleanup = useCallback(() => {
    isClosingRef.current = true;   // mark intentional close before closing PC
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
    isClosingRef.current = false;  // reset for new call
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: optsRef.current.callType === "video",
      });
    } catch {
      // Permission denied or device unavailable
      optsRef.current.onEnded("connection_failed");
      return;
    }

    streamRef.current = stream;
    optsRef.current.onStream?.(stream);

    if (optsRef.current.localRef.current) {
      optsRef.current.localRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection({
      iceServers: optsRef.current.iceServers as RTCIceServer[],
      iceTransportPolicy: "all",
    });
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    setupPC(pc);

    if (!optsRef.current.isReceiver) {
      // Caller: create and send offer immediately
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: optsRef.current.callType === "video" });
        await pc.setLocalDescription(offer);
        optsRef.current.onOffer(offer.sdp!);
      } catch { optsRef.current.onEnded("connection_failed"); }
    } else if (pendingOfferRef.current) {
      // Receiver: offer arrived before PC was ready — process it now
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
    } catch { /* ignore stale / invalid offer */ }
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
