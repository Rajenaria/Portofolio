import { requestIdentity, consumeBudget } from "../_shared/request-security.js";

const BUCKET = "portfolio-documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^certificates\/[0-9a-f-]{36}\.(pdf|webp)$/i;
const TYPES = { pdf: "application/pdf", webp: "image/webp" };
const HEADERS = {
  "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store", "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

export function createDocumentHandler({ client, env }) {
  const reply = (status, message, extra = {}) => new Response(message, {
    status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra }
  });
  return async function handle(req) {
    if (req.method === "OPTIONS") return reply(204, null);
    if (req.method !== "GET") return reply(405, "Method not allowed", { Allow: "GET, OPTIONS" });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!UUID.test(id || "") || [...url.searchParams.keys()].some(k => !["id", "download"].includes(k))) {
      return reply(400, "Invalid request");
    }
    try {
      const identity = await requestIdentity(req, env);
      if (!await consumeBudget(client, "certificate", identity)) {
        return reply(429, "Too many requests", { "Retry-After": "60" });
      }
      const read = () => client.from("certificates")
        .select("status,deleted_at,document_bucket,document_path,document_type")
        .eq("id", id).maybeSingle();
      const { data: row, error } = await read();
      if (error) return reply(503, "Document unavailable");
      if (!row || row.status !== "published" || row.deleted_at || row.document_bucket !== BUCKET ||
          !PATH.test(row.document_path || "") || !TYPES[row.document_type] ||
          !row.document_path.endsWith(`.${row.document_type}`)) return reply(404, "Document unavailable");
      const { data: blob, error: downloadError } = await client.storage.from(BUCKET).download(row.document_path);
      if (downloadError || !blob || !blob.size || blob.size > 10 * 1024 * 1024) {
        return reply(503, "Document unavailable");
      }
      // Recheck after Storage I/O so a hide or replacement during download fails closed.
      const { data: current, error: readError } = await read();
      if (readError) return reply(503, "Document unavailable");
      if (!current || current.status !== "published" || current.deleted_at ||
          current.document_bucket !== row.document_bucket || current.document_path !== row.document_path ||
          current.document_type !== row.document_type) return reply(404, "Document unavailable");
      return new Response(blob, { headers: {
        ...HEADERS, "Content-Type": TYPES[row.document_type],
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="certificate.${row.document_type}"`
      } });
    } catch { return reply(503, "Document unavailable"); }
  };
}
