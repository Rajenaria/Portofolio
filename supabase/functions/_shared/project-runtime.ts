import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
export function projectRuntime(){
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key||!anon)throw new Error('Unavailable');
 const boundedFetch=(input:RequestInfo|URL,init:RequestInit={})=>fetch(input,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(15000)].filter(Boolean) as AbortSignal[])});
 const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
 const client=createClient(url,key,options);
 const authorize=async(authorization:string)=>{
  if(!/^Bearer \S+$/i.test(authorization))return null;
  const userClient=createClient(url,anon,{...options,global:{...options.global,headers:{Authorization:authorization}}});
  const user=await userClient.auth.getUser(authorization.slice(7));if(user.error||!user.data.user)return null;
  const allowed=await userClient.rpc('can_manage_projects');return !allowed.error&&allowed.data===true?user.data.user.id:null;
 };
 return {client,authorize,env:(name:string)=>Deno.env.get(name)};
}
