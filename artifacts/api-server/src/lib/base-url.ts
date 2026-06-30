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
