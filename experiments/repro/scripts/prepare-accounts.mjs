import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../../..");
const runtime=path.join(root,"experiments/repro/runtime");
const envPath=path.join(runtime,".env");
for (const line of fs.readFileSync(envPath,"utf8").split(/\r?\n/)) { if(!line||line.trimStart().startsWith("#")||!line.includes("="))continue; const at=line.indexOf("="); process.env[line.slice(0,at)]=line.slice(at+1); }
const require=createRequire(path.join(root,"backend/package.json"));
const {Client}=require("pg"); const bcrypt=require("bcryptjs");
const runId=new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14);
const password=()=>crypto.randomBytes(24).toString("base64url");
const recipientName=`Thực nghiệm Holder ${runId}`; const studentCode=`REP-${runId}`;
const accounts={runId,baseUrl:process.env.PUBLIC_BASE_URL,checker:{username:`repro_checker_${runId}`,password:password(),role:"checker"},maker:{username:`repro_maker_${runId}`,password:password(),role:"maker"},student:{username:`repro_student_${runId}`,password:password(),role:"student",recipientName,studentCode,dateOfBirth:"2004-01-01",email:`student-${runId}@example.invalid`,cohort:"2022 - 2027"},studentTwin:{username:`repro_twin_${runId}`,password:password(),role:"student",recipientName,studentCode:`REP-TWIN-${runId}`,dateOfBirth:"2004-01-02",email:`twin-${runId}@example.invalid`,cohort:"2022 - 2027"}};
const db=new Client({host:process.env.POSTGRES_HOST,port:Number(process.env.POSTGRES_PORT),database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});
await db.connect();
try { const hash=await bcrypt.hash(accounts.checker.password,10); await db.query(`INSERT INTO users (username,"passwordHash",role,"recipientName") VALUES ($1,$2,'checker',NULL)`,[accounts.checker.username,hash]); } finally { await db.end(); }
async function call(p,o={}){const response=await fetch(accounts.baseUrl+p,o);const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}return{status:response.status,body}}
const login=await call("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:accounts.checker.username,password:accounts.checker.password})});
if(login.status!==201||!login.body?.token)throw new Error(`Bootstrap checker lỗi ${login.status}`);
for(const key of ["maker","student","studentTwin"]){const a=accounts[key];const response=await call("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${login.body.token}`},body:JSON.stringify(a)});if(response.status!==201)throw new Error(`Tạo ${key} lỗi ${response.status}`);a.id=response.body.id;}
const privateDir=path.join(runtime,"private");fs.mkdirSync(privateDir,{recursive:true,mode:0o700});const privatePath=path.join(privateDir,"accounts.json");fs.writeFileSync(privatePath,JSON.stringify(accounts,null,2),{mode:0o600});fs.chmodSync(privatePath,0o600);
fs.mkdirSync(path.join(runtime,"results"),{recursive:true});fs.writeFileSync(path.join(runtime,"results","account-bootstrap.json"),JSON.stringify({runId,roles:["checker","maker","student","studentTwin"],baseUrl:accounts.baseUrl,createdAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({ok:true,roles:4,privateMode:(fs.statSync(privatePath).mode&0o777).toString(8)}));
