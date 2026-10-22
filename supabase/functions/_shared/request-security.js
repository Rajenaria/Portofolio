// Header trust is a deployment setting, never inferred from client headers.
export async function requestIdentity(req, env) {
  const header = env("TRUSTED_PROXY_IP_HEADER");
  let identity = "shared-unverified-proxy";
  if (header) {
    if (!["x-forwarded-for", "cf-connecting-ip", "x-real-ip"].includes(header)) {
      throw new Error("Unsupported trusted proxy configuration");
    }
    const value = req.headers.get(header) || "";
    // A single overwritten address is required; forwarded chains are ambiguous.
    if (/^[0-9a-fA-F:.]{3,64}$/.test(value)) identity = value.toLowerCase();
  }
  const pepper = env("RATE_LIMIT_PEPPER");
  if (!pepper) throw new Error("Missing rate limit configuration");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumeBudget(client, scope, identity) {
  const { data, error } = await client.rpc("consume_request_budget", {
    p_scope: scope, p_identity: identity
  });
  if (error || typeof data !== "boolean") throw new Error("Rate limiter unavailable");
  return data;
}

export class ClientRequestError extends Error {
  constructor(status) { super("Invalid request"); this.status = status; }
}

export async function readJsonBody(req, maxBytes = 8192) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) {
    throw new ClientRequestError(415);
  }
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new ClientRequestError(413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ClientRequestError(400);
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ClientRequestError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch { throw new ClientRequestError(400); }
}
