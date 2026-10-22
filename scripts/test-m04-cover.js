/* Offline metadata contract checks. No network, credentials, or database access. */
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  const source = fs.readFileSync(path.join(root, "js/cms/project-cover.js"), "utf8");
  const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const results = [];
  function check(name, fn) { fn(); results.push({name, status: "PASS"}); }
  const defaults = {cover_fit:"cover", cover_position_x:50, cover_position_y:50};
  check("old-record-defaults", () => assert.deepEqual(api.normalizeCover({}), defaults));
  for (const fit of ["cover", "contain"]) for (const n of [0,50,100]) {
    const value={cover_fit:fit,cover_position_x:n,cover_position_y:n};
    check(`valid-${fit}-${n}`,()=>assert.equal(api.validCover(value),true));
  }
  for (const value of [-1,101,1.5,NaN,Infinity,"50",null,undefined]) {
    check(`reject-position-${String(value)}`,()=>assert.equal(api.validCover({...defaults,cover_position_x:value}),false));
    check(`fallback-position-${String(value)}`,()=>assert.equal(api.normalizeCover({...defaults,cover_position_y:value}).cover_position_y,50));
  }
  for (const fit of ["", "COVER", "url(javascript:bad)", null]) {
    check(`reject-fit-${fit}`,()=>assert.equal(api.validCover({...defaults,cover_fit:fit}),false));
  }
  check("bounded-style-assignment",()=>{
    const image={style:{},dataset:{}};
    api.applyCover(image,{cover_fit:"contain",cover_position_x:0,cover_position_y:100});
    assert.deepEqual(image,{style:{objectFit:"contain",objectPosition:"0% 100%"},dataset:{coverFit:"contain"}});
  });
  for (const code of ["42703","PGRST204"]) {
    check(`schema-${code}`,()=>assert.equal(api.missingCoverSchema({code,message:"column cover_position_y missing"}),true));
  }
  for (const error of [{code:"42501",message:"cover_fit denied"},{code:"42703",message:"title missing"},{}]) {
    check("non-schema-errors-do-not-trigger-compatibility",()=>assert.equal(api.missingCoverSchema(error),false));
  }
  const sql=fs.readFileSync(path.join(root,"supabase/migrations/20261019020000_m04_project_cover_layout.sql"),"utf8");
  check("SQL-static-only-three-approved-columns",()=>{
    assert.equal((sql.match(/add column /g)||[]).length,3);
    for(const name of ["cover_fit","cover_position_x","cover_position_y"]) assert(sql.includes(`add column ${name}`));
    assert(sql.includes("in ('cover', 'contain')"));
    assert.equal((sql.match(/between 0 and 100/g)||[]).length,2);
    assert(!/create policy|drop |storage\.|grant |revoke /i.test(sql));
  });
  console.log(JSON.stringify({summary:{passed:results.length,failed:0},results,limitations:["SQL inspected statically; constraints not executed on PostgreSQL."]},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
