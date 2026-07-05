import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
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

/**
 * Raw body capture for Plisio webhook — MUST come before express.json().
 *
 * Two problems this solves:
 * 1. Plisio may POST with Content-Type other than application/json (or no
 *    Content-Type at all), so express.json() would silently skip parsing and
 *    req.body would be undefined.
 * 2. HMAC verification must be done on the exact bytes Plisio signed, i.e.
 *    the raw JSON string as received — NOT on the payload re-serialized after
 *    JSON.parse(), because JSON.stringify() is not guaranteed to preserve the
 *    exact representation (numbers, key order when body has been transformed).
 */
app.use(
  "/webhook/plisio",
  (req: Request & { rawBody?: string }, _res, next) => {
    if (req.method !== "POST") return next();

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      req.rawBody = raw;

      if (raw) {
        try {
          // Parse manually so the body is available regardless of Content-Type
          req.body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          logger.warn("plisio raw-body: failed to parse JSON from webhook body");
        }
      }
      next();
    });
    req.on("error", (err) => {
      logger.error({ err }, "plisio raw-body: stream error");
      next(err);
    });
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/webhook/tetrapay", tetraPayRouter);
app.use("/webhook/plisio",  plisioRouter);

export default app;
