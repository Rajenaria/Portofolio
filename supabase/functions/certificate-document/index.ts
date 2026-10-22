import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createDocumentHandler } from "./handler.js";

// Only server environment values. Never imported by the frontend.
Deno.serve(async req => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  return createDocumentHandler({
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    env: name => Deno.env.get(name)
  })(req);
});
