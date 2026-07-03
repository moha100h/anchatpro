/**
 * Detects the public base URL of this server.
 * Priority: BASE_URL env → REPLIT_DEV_DOMAIN → localhost fallback
 */
export function getBaseUrl(): string {
  if (process.env["BASE_URL"]) {
    return process.env["BASE_URL"].replace(/\/$/, "");
  }
  if (process.env["REPLIT_DEV_DOMAIN"]) {
    return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  }
  const port = process.env["PORT"] ?? "8080";
  return `http://localhost:${port}`;
}

export function getTetraPayCallbackUrl(): string {
  return `${getBaseUrl()}/webhook/tetrapay`;
}

export function getPlisioCallbackUrl(): string {
  return `${getBaseUrl()}/webhook/plisio`;
}

/**
 * Example success/fail redirect URLs shown to the admin for reference.
 * These are NOT set in the Plisio dashboard — Plisio has no such global
 * setting. They are generated automatically per-order and sent with each
 * CREATE_INVOICE API call (see plisio.service.ts). Shown here only so the
 * admin can see/copy the pattern if needed (e.g. for their own website).
 */
export function getPlisioSuccessUrlExample(): string {
  return `${getBaseUrl()}/webhook/plisio/return?r=ok&order=<order_number>`;
}

export function getPlisioFailUrlExample(): string {
  return `${getBaseUrl()}/webhook/plisio/return?r=fail&order=<order_number>`;
}
