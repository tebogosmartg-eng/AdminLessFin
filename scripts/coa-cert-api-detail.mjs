import fs from "fs";
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split(/\r?\n/).filter(l=>/^[A-Z0-9_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const url=env.VITE_SUPABASE_URL, anon=env.VITE_SUPABASE_ANON_KEY;
const login=await(await fetch(url+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:anon,"Content-Type":"application/json"},body:JSON.stringify({email:env.E2E_EMAIL,password:env.E2E_PASSWORD})})).json();
const headers={apikey:anon,Authorization:"Bearer "+login.access_token,"Content-Type":"application/json"};
const sys=await(await fetch(url+"/rest/v1/chart_of_accounts?select=id,name,company_id,is_active,system_account&system_account=eq.true&limit=1",{headers})).json();
const id=sys[0].id, company_id=sys[0].company_id;
async function call(body){const r=await fetch(url+"/functions/v1/chart-of-accounts",{method:"POST",headers,body:JSON.stringify({company_id,...body})}); return {status:r.status, body:await r.json()};}
const del=await call({method:"DELETE",accountId:id});
const typ=await call({method:"PUT",accountId:id,accountData:{type:"Liability"}});
const gen=await call({method:"GENERATE",templateKey:"standard-ifrs-sme-za"});
const out={sys:sys[0], delete:del, type:typ, generate:gen};
fs.writeFileSync("docs/coa-certification/evidence/api-system-block-detail.json", JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
