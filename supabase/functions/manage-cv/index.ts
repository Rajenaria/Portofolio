import { createClient } from "npm:@supabase/supabase-js@2";
import { createManageCvHandler } from "../_shared/cv-service.js";

Deno.serve(async req => {
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!key||!anon)return new Response("Unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  // Bound each backend request; uncertain writes are never cleaned up automatically.
  const boundedFetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(15000)].filter(Boolean))});
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
  const client=createClient(url,key,options);
  const authorize=async authorization=>{
    if(!/^Bearer \S+$/i.test(authorization))return false;
    const jwt=authorization.slice(7),userClient=createClient(url,anon,{...options,global:{...options.global,headers:{Authorization:authorization}}});
    const user=await userClient.auth.getUser(jwt);if(user.error||!user.data.user)return false;
    const allowed=await userClient.rpc("can_manage_cv");return !allowed.error&&allowed.data===true;
  };
  return createManageCvHandler({client,authorize,env:name=>Deno.env.get(name)})(req);
});
