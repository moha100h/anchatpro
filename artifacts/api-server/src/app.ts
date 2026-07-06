import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router, { tetraPayRouter, plisioRouter } from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first reverse proxy (nginx / Cloudflare / etc.).
// Without this, req.ip is always 127.0.0.1 behind nginx, and — more critically —
// Express may reject X-Forwarded-Proto: https headers, breaking HTTPS detection.
// This setting is safe even when running without a proxy.
app.set("trust proxy", 1);

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
 * WHY THIS MIDDLEWARE EXISTS:
 * 1. Plisio may POST with Content-Type other than "application/json" (or none),
 *    so express.json() would silently skip parsing and req.body would be {}.
 * 2. HMAC-SHA1 verification MUST use the exact raw bytes Plisio signed — NOT
 *    a re-serialised JavaScript object (JSON.stringify of parsed JSON is NOT
 *    guaranteed to reproduce the original byte sequence due to numeric format
 *    differences and key-order changes across Node.js versions).
 *
 * IMPORTANT — prevents body-parser from corrupting req.body:
 * After this middleware consumes the stream, express.json() running afterwards
 * would see an empty stream (0 bytes). Depending on Content-Length, body-parser
 * may either set req.body = {} or throw a "request size did not match" error.
 * Both outcomes corrupt the body we already parsed.
 *
 * Fix: set req._body = true (internal body-parser flag) so that express.json()
 * and express.urlencoded() skip this request entirely, leaving our req.body intact.
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

      // Tell body-parser to skip this request — we already parsed the body.
      // Without this, express.json() reads from the exhausted stream, gets 0
      // bytes, and may overwrite req.body with {} or emit a parse error.
      (req as any)._body = true;

      if (raw) {
        // Detect and log form-encoded bodies (Plisio sent without ?json=true).
        if (raw.includes("=") && !raw.trimStart().startsWith("{")) {
          logger.warn(
            { rawBodyStart: raw.slice(0, 80), contentType: req.headers["content-type"] },
            "plisio raw-body: body appears to be form-encoded, not JSON. " +
            "Check that callback_url in settings ends without ?json=true — " +
            "the service appends it automatically. Also verify the Plisio " +
            "dashboard Status URL includes ?json=true."
          );
          // Leave req.body = {} — HMAC verification will fail and log the issue.
        } else {
          try {
            req.body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            logger.warn(
              { rawBodyStart: raw.slice(0, 80), contentType: req.headers["content-type"] },
              "plisio raw-body: failed to JSON.parse webhook body"
            );
          }
        }
      } else {
        logger.warn(
          { contentType: req.headers["content-type"] },
          "plisio raw-body: empty body received"
        );
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
