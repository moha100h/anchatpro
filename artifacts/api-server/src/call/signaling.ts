import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { validateInitData } from "./auth.js";
import { getCallCost, deductCallCoinsFromBoth, getUserCoins } from "./coin-guard.js";
import { joinQueue, leaveQueue, findMatch, confirmMatch, endSession, getActiveCallSession } from "./queue.js";
import { getSetting } from "../bot/services/payment.service.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallClient {
  ws:              WebSocket;
  userId:          number;
  roomToken?:      string;
  sessionId?:      number;
  partnerId?:      number;
  heartbeatTimer?: ReturnType<typeof setTimeout>;
  maxDurationTimer?: ReturnType<typeof setTimeout>;
  authenticated:   boolean;
}

type InMsg =
  | { type: "auth";         initData: string }
  | { type: "join_queue";   callType: "voice" | "video"; genderFilter: "male" | "female" | "random" }
  | { type: "leave_queue" }
  | { type: "offer";        sdp: string }
  | { type: "answer";       sdp: string }
  | { type: "ice_candidate"; candidate: unknown }
  | { type: "call_ready" }
  | { type: "call_end" }
  | { type: "heartbeat" };

// ─── State ────────────────────────────────────────────────────────────────────

const clients  = new Map<number, CallClient>();         // userId → client
const rooms    = new Map<string, [number, number]>();   // roomToken → [callerUserId, receiverUserId]

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS  = 35_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(client: CallClient, msg: object): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(msg));
  }
}

function sendToPartner(client: CallClient, msg: object): void {
  if (!client.partnerId) return;
  const partner = clients.get(client.partnerId);
  if (partner) send(partner, msg);
}

function resetHeartbeat(client: CallClient): void {
  if (client.heartbeatTimer) clearTimeout(client.heartbeatTimer);
  client.heartbeatTimer = setTimeout(() => {
    logger.warn({ userId: client.userId }, "WS heartbeat timeout — closing");
    client.ws.terminate();
  }, HEARTBEAT_TIMEOUT_MS);
}

async function startMaxDurationTimer(client: CallClient, sessionId: number, minutes: number): Promise<void> {
  const ms = minutes * 60_000;
  client.maxDurationTimer = setTimeout(async () => {
    const partner = client.partnerId ? clients.get(client.partnerId) : undefined;
    const force = { type: "force_end", reason: "max_duration" };
    send(client, force);
    if (partner) send(partner, force);
    await cleanupSession(client, "max_duration_reached");
    if (partner) await cleanupSession(partner, "max_duration_reached");
  }, ms);
}

async function cleanupSession(client: CallClient, reason: string): Promise<void> {
  if (client.heartbeatTimer)    clearTimeout(client.heartbeatTimer);
  if (client.maxDurationTimer)  clearTimeout(client.maxDurationTimer);

  if (client.sessionId) {
    try { await endSession(client.sessionId, reason); } catch { /* ignore */ }
  }
  if (client.roomToken) {
    rooms.delete(client.roomToken);
  }

  client.roomToken      = undefined;
  client.sessionId      = undefined;
  client.partnerId      = undefined;
  client.maxDurationTimer = undefined;
}

async function handleDisconnect(client: CallClient): Promise<void> {
  logger.info({ userId: client.userId }, "WS client disconnected");

  if (client.partnerId) {
    const partner = clients.get(client.partnerId);
    if (partner) {
      send(partner, { type: "partner_left" });
      await cleanupSession(partner, "partner_disconnected");
    }
  }

  await cleanupSession(client, "client_disconnected");
  await leaveQueue(client.userId).catch(() => {});
  clients.delete(client.userId);
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(client: CallClient, raw: string): Promise<void> {
  let msg: InMsg;
  try { msg = JSON.parse(raw) as InMsg; } catch { return; }

  resetHeartbeat(client);

  // ── Auth (must be first message) ──────────────────────────────────────────
  if (msg.type === "auth") {
    const user = validateInitData(msg.initData);
    if (!user) {
      send(client, { type: "error", code: "auth_failed" });
      client.ws.close(1008, "Auth failed");
      return;
    }
    // Kick any existing connection for this user
    const existing = clients.get(user.id);
    if (existing && existing !== client) {
      existing.ws.close(1000, "Replaced");
      clients.delete(user.id);
    }
    client.userId        = user.id;
    client.authenticated = true;
    clients.set(user.id, client);
    send(client, { type: "auth_ok" });
    return;
  }

  if (!client.authenticated) {
    send(client, { type: "error", code: "not_authenticated" });
    return;
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────
  if (msg.type === "heartbeat") {
    send(client, { type: "heartbeat_ack" });
    return;
  }

  // ── Join queue ───────────────────────────────────────────────────────────
  if (msg.type === "join_queue") {
    const callEnabled = await getSetting("call_enabled");
    if (callEnabled === "0") {
      send(client, { type: "error", code: "call_disabled" });
      return;
    }
    if (msg.callType === "video") {
      const videoEnabled = await getSetting("call_video_enabled");
      if (videoEnabled === "0") {
        send(client, { type: "error", code: "video_disabled" });
        return;
      }
    }

    // Check for active session already
    const active = await getActiveCallSession(client.userId);
    if (active) {
      send(client, { type: "error", code: "already_in_call" });
      return;
    }

    const cost = await getCallCost(msg.callType, msg.genderFilter);
    const balance = await getUserCoins(client.userId);
    const minBalance = parseInt((await getSetting("call_min_balance")) ?? "3", 10);

    if (balance < Math.max(cost, minBalance)) {
      send(client, { type: "error", code: "insufficient_coins", required: cost, balance });
      return;
    }

    const dbUser = await getUserByTelegramId(client.userId);

    // Try to find a match
    const match = await findMatch(client.userId, msg.callType, msg.genderFilter, dbUser?.gender ?? null);

    if (!match) {
      // No match — join queue
      const roomToken = await joinQueue(client.userId, msg.callType, msg.genderFilter);
      send(client, { type: "queued", position: 1 });
      logger.info({ userId: client.userId, callType: msg.callType }, "Joined call queue");
      return;
    }

    // Match found! Deduct coins from both
    const partnerClient = clients.get(match.userId);
    const partnerCost   = await getCallCost(msg.callType, match.genderFilter);

    const deduct = await deductCallCoinsFromBoth(
      client.userId, cost,
      match.userId,  partnerCost,
    );

    if (!deduct.success) {
      // Deduction failed — put caller in queue, partner stays
      await joinQueue(client.userId, msg.callType, msg.genderFilter);
      send(client, { type: "queued", position: 1 });
      return;
    }

    // Create session
    const sessionRoomToken = randomUUID().replace(/-/g, "").slice(0, 32);
    const maxMinutes = parseInt((await getSetting("call_max_duration_minutes")) ?? "30", 10);
    const turnHost   = (await getSetting("call_turn_host"))       ?? "tisabuy.com";
    const turnPort   = (await getSetting("call_turn_port"))       ?? "3478";
    const turnUser   = (await getSetting("call_turn_username"))   ?? "";
    const turnCred   = (await getSetting("call_turn_credential")) ?? "";

    const iceServers = [
      { urls: `stun:${turnHost}:${turnPort}` },
      ...(turnUser && turnCred
        ? [{
            urls: [`turn:${turnHost}:${turnPort}`, `turns:${turnHost}:5349`],
            username:   turnUser,
            credential: turnCred,
          }]
        : []),
    ];

    const sessionId = await confirmMatch({
      callerUserId:          client.userId,
      receiverUserId:        match.userId,
      callType:              msg.callType,
      callerGenderFilter:    msg.genderFilter,
      roomToken:             sessionRoomToken,
      coinsDeductedCaller:   cost,
      coinsDeductedReceiver: partnerCost,
    });

    rooms.set(sessionRoomToken, [client.userId, match.userId]);

    // Set up caller
    client.roomToken  = sessionRoomToken;
    client.sessionId  = sessionId;
    client.partnerId  = match.userId;

    // Set up receiver (partner)
    if (partnerClient) {
      partnerClient.roomToken = sessionRoomToken;
      partnerClient.sessionId = sessionId;
      partnerClient.partnerId = client.userId;
    }

    const matchedPayload = {
      type:        "matched",
      roomToken:   sessionRoomToken,
      callType:    msg.callType,
      iceServers,
      coinsDeducted: cost,
      balance:       deduct.callerBalance,
    };

    send(client, matchedPayload);

    if (partnerClient) {
      send(partnerClient, {
        ...matchedPayload,
        coinsDeducted: partnerCost,
        balance:       deduct.receiverBalance,
        isReceiver:    true,
      });
      await startMaxDurationTimer(client, sessionId, maxMinutes);
    }

    logger.info({ caller: client.userId, receiver: match.userId, callType: msg.callType }, "Call matched");
    return;
  }

  // ── Leave queue ──────────────────────────────────────────────────────────
  if (msg.type === "leave_queue") {
    await leaveQueue(client.userId);
    send(client, { type: "left_queue" });
    return;
  }

  // ── WebRTC signaling relay ───────────────────────────────────────────────
  if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice_candidate") {
    sendToPartner(client, { type: msg.type, ...(msg as object) });
    return;
  }

  // ── Call ready (both sides connected) ────────────────────────────────────
  if (msg.type === "call_ready") {
    sendToPartner(client, { type: "partner_ready" });
    return;
  }

  // ── Call end ─────────────────────────────────────────────────────────────
  if (msg.type === "call_end") {
    sendToPartner(client, { type: "call_ended" });
    const partnerId = client.partnerId;
    const partner   = partnerId ? clients.get(partnerId) : undefined;
    await cleanupSession(client, "user_ended");
    if (partner) await cleanupSession(partner, "partner_ended");
    send(client, { type: "call_ended" });
    return;
  }
}

// ─── Mount ────────────────────────────────────────────────────────────────────

export function mountCallSignaling(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/call" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const client: CallClient = {
      ws,
      userId:        0,
      authenticated: false,
    };

    resetHeartbeat(client);

    ws.on("message", (data) => {
      handleMessage(client, data.toString()).catch((err) => {
        logger.error({ err, userId: client.userId }, "WS message handler error");
      });
    });

    ws.on("close", () => {
      handleDisconnect(client).catch((err) => {
        logger.error({ err, userId: client.userId }, "WS disconnect handler error");
      });
    });

    ws.on("error", (err) => {
      logger.error({ err, userId: client.userId }, "WS error");
    });
  });

  // Periodic ping to all clients
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  logger.info("Call signaling WebSocket mounted at /ws/call");
}
