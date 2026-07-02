import { useEffect, useRef, useCallback } from "react";
import type { WsInMessage } from "../types.js";

const WS_PATH = "/ws/call";
const HEARTBEAT_INTERVAL_MS = 20_000;

type MessageHandler = (msg: WsInMessage) => void;

export function useSignaling(onMessage: MessageHandler) {
  const wsRef     = useRef<WebSocket | null>(null);
  const hbRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMsgRef  = useRef(onMessage);
  onMsgRef.current = onMessage;

  const send = useCallback((data: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws    = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsInMessage;
        onMsgRef.current(msg);
      } catch { /* ignore */ }
    };

    ws.onopen = () => {
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData ?? "";
      ws.send(JSON.stringify({ type: "auth", initData }));

      hbRef.current = setInterval(() => {
        ws.send(JSON.stringify({ type: "heartbeat" }));
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onclose = () => {
      if (hbRef.current) clearInterval(hbRef.current);
    };

    return () => {
      if (hbRef.current) clearInterval(hbRef.current);
      ws.close();
    };
  }, []);

  return { send };
}
