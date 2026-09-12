import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(path.join(root, "backend/package.json"));
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
  const at = line.indexOf("=");
  if (!(line.slice(0, at) in process.env)) process.env[line.slice(0, at)] = line.slice(at + 1);
}
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const password = () => crypto.randomBytes(24).toString("base64url");
const recipientName = `Thực nghiệm B12 Holder ${runId}`;
const accounts = {
  runId,
  baseUrl: process.env.PUBLIC_BASE_URL,
  checker: { username: `b12_checker_${runId}`, password: password(), role: "checker" },
  maker: { username: `b12_maker_${runId}`, password: password(), role: "maker" },
  student: { username: `b12_student_${runId}`, password: password(), role: "student", recipientName },
};
const db = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});
await db.connect();
try {
  const hash = await bcrypt.hash(accounts.checker.password, 10);
  await db.query(
    `INSERT INTO users (username, "passwordHash", role, "recipientName") VALUES ($1,$2,'checker',NULL)`,
    [accounts.checker.username, hash],
  );
} finally { await db.end(); }

async function call(pathname, options = {}) {
  const response = await fetch(accounts.baseUrl + pathname, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}
const login = await call("/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: accounts.checker.username, password: accounts.checker.password }),
});
if (login.status !== 201 || !login.body?.token) throw new Error(`Bootstrap checker login lỗi ${login.status}`);
const created = [];
for (const key of ["maker", "student"]) {
  const account = accounts[key];
  const response = await call("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify(account),
  });
  if (response.status !== 201) throw new Error(`Tạo ${key} lỗi ${response.status}: ${JSON.stringify(response.body)}`);
  created.push({ role: key, id: response.body.id, username: response.body.username });
}
const privateDir = path.join(root, "experiments/private");
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const privatePath = path.join(privateDir, "current-accounts.json");
fs.writeFileSync(privatePath, JSON.stringify(accounts, null, 2), { mode: 0o600 });
fs.chmodSync(privatePath, 0o600);
const publicResult = { runId, baseUrl: accounts.baseUrl, checkerBootstrap: accounts.checker.username, created, recipientName, createdAt: new Date().toISOString() };
fs.writeFileSync(path.join(root, "experiments/results/account-bootstrap.json"), JSON.stringify(publicResult, null, 2));
console.log(JSON.stringify({ ok: true, runId, roles: ["checker", "maker", "student"], privateMode: (fs.statSync(privatePath).mode & 0o777).toString(8) }));
