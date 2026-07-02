import { Router } from "express";
import { validateInitData } from "./auth.js";
import { getCallCost, getUserCoins } from "./coin-guard.js";
import { getSetting } from "../bot/services/payment.service.js";
import { db, callSessionsTable, usersTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";

const router = Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

function getCallUserId(req: any): number | null {
  const raw = (req.headers["x-init-data"] as string) ?? (req.query["initData"] as string) ?? "";
  const user = validateInitData(raw);
  return user ? user.id : null;
}

function authRequired(req: any, res: any, next: any): void {
  const userId = getCallUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  req.callUserId = userId;
  next();
}

// ─── GET /api/call/config ─────────────────────────────────────────────────────

router.get("/config", authRequired, async (_req, res) => {
  try {
    const [
      callEnabled, videoEnabled,
      voiceRandom, voiceGender, videoRandom, videoGender,
      minBalance, maxMinutes,
      turnHost, turnPort, turnUser, turnCred,
    ] = await Promise.all([
      getSetting("call_enabled"),
      getSetting("call_video_enabled"),
      getSetting("call_cost_voice_random"),
      getSetting("call_cost_voice_gender"),
      getSetting("call_cost_video_random"),
      getSetting("call_cost_video_gender"),
      getSetting("call_min_balance"),
      getSetting("call_max_duration_minutes"),
      getSetting("call_turn_host"),
      getSetting("call_turn_port"),
      getSetting("call_turn_username"),
      getSetting("call_turn_credential"),
    ]);

    res.json({
      callEnabled:  (callEnabled  ?? "1") !== "0",
      videoEnabled: (videoEnabled ?? "1") !== "0",
      costs: {
        voiceRandom: parseInt(voiceRandom ?? "3",  10),
        voiceGender: parseInt(voiceGender ?? "5",  10),
        videoRandom: parseInt(videoRandom ?? "6",  10),
        videoGender: parseInt(videoGender ?? "10", 10),
      },
      minBalance:        parseInt(minBalance  ?? "3",  10),
      maxDurationMinutes: parseInt(maxMinutes ?? "30", 10),
      turnConfig: {
        host:       turnHost       ?? "tisabuy.com",
        port:       parseInt(turnPort ?? "3478", 10),
        username:   turnUser       ?? "",
        credential: turnCred       ?? "",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/call/balance ────────────────────────────────────────────────────

router.get("/balance", authRequired, async (req: any, res) => {
  try {
    const coins = await getUserCoins(req.callUserId);
    res.json({ coins });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/call/cost ───────────────────────────────────────────────────────

router.get("/cost", authRequired, async (req: any, res) => {
  const callType     = req.query["callType"]     as "voice" | "video"             ?? "voice";
  const genderFilter = req.query["genderFilter"] as "male" | "female" | "random"  ?? "random";
  try {
    const cost    = await getCallCost(callType, genderFilter);
    const balance = await getUserCoins(req.callUserId);
    res.json({ cost, balance, canCall: balance >= cost });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/call/history ────────────────────────────────────────────────────

router.get("/history", authRequired, async (req: any, res) => {
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 50);
  try {
    const rows = await db
      .select({
        id:                    callSessionsTable.id,
        callType:              callSessionsTable.callType,
        genderFilter:          callSessionsTable.genderFilter,
        status:                callSessionsTable.status,
        coinsDeductedCaller:   callSessionsTable.coinsDeductedCaller,
        coinsDeductedReceiver: callSessionsTable.coinsDeductedReceiver,
        callerUserId:          callSessionsTable.callerUserId,
        createdAt:             callSessionsTable.createdAt,
        connectedAt:           callSessionsTable.connectedAt,
        endedAt:               callSessionsTable.endedAt,
        endReason:             callSessionsTable.endReason,
      })
      .from(callSessionsTable)
      .where(
        or(
          eq(callSessionsTable.callerUserId,   req.callUserId),
          eq(callSessionsTable.receiverUserId, req.callUserId),
        )
      )
      .orderBy(desc(callSessionsTable.createdAt))
      .limit(limit);

    const history = rows.map(r => ({
      id:           r.id,
      callType:     r.callType,
      genderFilter: r.genderFilter,
      status:       r.status,
      coinsSpent:   r.callerUserId === req.callUserId ? r.coinsDeductedCaller : r.coinsDeductedReceiver,
      createdAt:    r.createdAt,
      connectedAt:  r.connectedAt,
      endedAt:      r.endedAt,
      endReason:    r.endReason,
    }));

    res.json({ history });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
