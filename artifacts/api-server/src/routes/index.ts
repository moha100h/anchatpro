import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tetraPayRouter from "./tetrapay";
import plisioRouter from "./plisio";
import callRouter from "../call/routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/call", callRouter);

export default router;

// Webhook routes (not under /api prefix — mounted directly in app.ts)
export { tetraPayRouter, plisioRouter };
