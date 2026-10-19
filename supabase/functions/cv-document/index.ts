import { createClient } from "npm:@supabase/supabase-js@2";
import { createCvDeliveryHandler } from "../_shared/cv-service.js";

Deno.serve(async req => {
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return new Response("Unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  // Bound private Storage and metadata reads.
  const boundedFetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(15000)].filter(Boolean))});
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
  const client=createClient(url,key,options);
  return createCvDeliveryHandler({client,env:name=>Deno.env.get(name)})(req);
});
