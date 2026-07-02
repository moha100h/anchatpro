import { useRef, useCallback, useEffect } from "react";
import type { IceServer } from "../types.js";

interface UseWebRTCOptions {
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
}

export function useWebRTC(opts: UseWebRTCOptions) {
  const pcRef      = useRef<RTCPeerConnection | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: opts.callType === "video",
    });
    streamRef.current = stream;

    if (opts.localRef.current) {
      opts.localRef.current.srcObject = stream;
    }

    const pc = new RTCPeerConnection({ iceServers: opts.iceServers as RTCIceServer[] });
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (opts.remoteRef.current && remoteStream) {
        opts.remoteRef.current.srcObject = remoteStream;
      }
      opts.onReady();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) opts.onIceCand(ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        opts.onEnded("connection_failed");
      }
    };

    if (!opts.isReceiver) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      opts.onOffer(offer.sdp!);
    }
  }, [opts]);

  const handleOffer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    opts.onAnswer(answer.sdp!);
  }, [opts]);

  const handleAnswer = useCallback(async (sdp: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "answer", sdp });
  }, []);

  const handleIceCandidate = useCallback(async (cand: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(cand));
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return { start, handleOffer, handleAnswer, handleIceCandidate, cleanup };
}
