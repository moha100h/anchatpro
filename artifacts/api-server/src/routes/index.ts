import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tetraPayRouter from "./tetrapay";

const router: IRouter = Router();

router.use(healthRouter);

export default router;

// Webhook routes (not under /api prefix — mounted directly in app.ts)
export { tetraPayRouter };
