import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import router, { tetraPayRouter, plisioRouter } from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/webhook/tetrapay", tetraPayRouter);
app.use("/webhook/plisio",  plisioRouter);

// ── Mini App static files at /call/ ──────────────────────────────────────
const miniAppDist = path.resolve(__dirname, "../../mini-app/dist");
app.use("/call", express.static(miniAppDist, { index: "index.html" }));
app.use("/call", (_req, res) => {
  res.sendFile(path.join(miniAppDist, "index.html"));
});

export default app;
