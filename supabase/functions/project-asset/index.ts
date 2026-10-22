import { projectRuntime } from '../_shared/project-runtime.ts';
import { createProjectAssetHandler } from '../_shared/project-service.js';
Deno.serve(req=>{try{return createProjectAssetHandler(projectRuntime())(req);}catch{return new Response('Unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}});
