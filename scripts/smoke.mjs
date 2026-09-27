// Smoke test: boot the built stdio server, run a JSON-RPC initialize handshake
// and a tools/list, and assert the expected tools come back. No network calls,
// no API key needed. Exits non-zero on any failure.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const EXPECTED = [
  "check_availability", "signup", "whoami", "attach_email", "claim_domain",
  "list_domains", "get_domain", "delete_domain", "add_dns_record", "delete_record",
  "add_acme_challenge", "set_forward", "remove_forward", "set_proxy",
  "remove_proxy", "delegate_nameservers", "delete_account",
  "upgrade_to_pro", "manage_billing",
];

const child = spawn(process.execPath, [join(root, "dist", "index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  // Deliberately keyless: listing tools must not require credentials.
  env: { ...process.env, AGENTDOMAINS_API_KEY: "" },
});

let stderr = "";
child.stderr.on("data", (d) => { stderr += d.toString(); });

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

const responses = new Map();
let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined) responses.set(msg.id, msg);
  }
});

const waitFor = (id, ms = 10000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (responses.has(id)) { clearInterval(tick); resolve(responses.get(id)); }
      else if (Date.now() - started > ms) {
        clearInterval(tick);
        reject(new Error(`timed out waiting for response ${id}. stderr:\n${stderr}`));
      }
    }, 25);
  });

const fail = (msg) => { console.error(`FAIL: ${msg}`); child.kill(); process.exit(1); };

try {
  send({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0" },
    },
  });
  const init = await waitFor(1);
  if (init.error) fail(`initialize returned an error: ${JSON.stringify(init.error)}`);
  if (!init.result?.serverInfo?.name) fail("initialize returned no serverInfo.name");
  // serverInfo.version and the User-Agent both come from package.json; if this
  // ever disagrees, one of them has grown its own literal again.
  if (init.result.serverInfo.version !== PKG_VERSION) {
    fail(`serverInfo.version is ${init.result.serverInfo.version}, package.json says ${PKG_VERSION}`);
  }
  console.log(`ok  initialize -> ${init.result.serverInfo.name} v${init.result.serverInfo.version} (matches package.json)`);

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const list = await waitFor(2);
  if (list.error) fail(`tools/list returned an error: ${JSON.stringify(list.error)}`);

  const names = (list.result?.tools ?? []).map((t) => t.name);
  const missing = EXPECTED.filter((n) => !names.includes(n));
  if (missing.length) fail(`tools/list is missing: ${missing.join(", ")}`);
  for (const t of list.result.tools) {
    if (!t.description) fail(`tool ${t.name} has no description`);
    if (t.inputSchema?.type !== "object") fail(`tool ${t.name} has no object inputSchema`);
  }
  console.log(`ok  tools/list -> ${names.length} tools, all ${EXPECTED.length} expected present`);

  // An authenticated tool with no key must return a clean tool error, not crash.
  send({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "whoami", arguments: {} },
  });
  const call = await waitFor(3);
  if (call.error) fail(`tools/call crashed the protocol: ${JSON.stringify(call.error)}`);
  if (!call.result?.isError) fail("keyless whoami should have returned isError");
  const text = call.result.content?.[0]?.text ?? "";
  if (!text.includes("no API key")) fail(`unexpected keyless error text: ${text}`);
  console.log("ok  tools/call whoami (no key) -> clean tool error");

  console.log("\nSMOKE TEST PASSED");
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err.message);
}
