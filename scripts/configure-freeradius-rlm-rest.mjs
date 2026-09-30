#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// configure-freeradius-rlm-rest.mjs
//
// Wires FreeRADIUS 3.2.x's rlm_rest module to POST Access-Request
// payloads to the CRYPTSK session-engine /api/auth endpoint on port
// 3010 (localhost). Runs against prod (103.244.7.221:22222).
//
// Steps performed over SSH:
//   1. Enable rest module (ln -sf mods-available/rest → mods-enabled/rest)
//   2. Backup + rewrite /etc/raddb/mods-available/rest with our rlm_rest config
//   3. Insert `rest` into the authorize {} block of sites-available/default
//      (idempotent — skipped if already present)
//   4. Append a test client to clients.conf (localhost / testing123)
//      (idempotent — skipped if "testing123" already present)
//   5. Run `radiusd -C` to validate the configuration
//   6. DOES NOT restart radiusd — operator must run `systemctl start radiusd`
//      (or `systemctl restart radiusd`) after reviewing the output
//
// Usage:
//   node scripts/configure-freeradius-rlm-rest.mjs
//
// Prerequisite: ssh2 module installed at
//   /home/z/my-project/node_modules/ssh2/lib/index.js
// ═══════════════════════════════════════════════════════════════

import { Client } from "/home/z/my-project/node_modules/ssh2/lib/index.js";

const SSH_CONFIG = {
  host: "103.244.7.221",
  port: 22222,
  username: "root",
  password: "CryptSK@123#$",
  readyTimeout: 30000,
};

// ─── rlm_rest config block ───────────────────────────────────────
// FreeRADIUS 3.2.x modern syntax (we don't use the legacy `server`,
// `port`, `ssl_support` keys — they're 2.x-era options and ignored
// by 3.x). The semantic equivalent of:
//   server = "localhost" / port = 3010 / ssl_support = "no"
// is `connect_uri = "http://localhost:3010"` + a tls{} block with
// check_cert = no (which is moot over plain HTTP, but included for
// completeness).
//
// Body mapping: rlm_rest's `body = "json"` sets Content-Type:
// application/json. We use `data = '...'` to override the body with a
// hand-rolled JSON template using xlat expansion to pull values from
// RADIUS request attributes. The keys match session-engine /api/auth's
// expected schema (camelCase).
//
// KNOWN LIMITATION: rlm_rest's `data` xlat expansion does NOT JSON-escape
// values. If a User-Password contains a double-quote or backslash, the
// resulting JSON will be malformed. Mitigation: in production, validate
// passwords on the session-engine side and reject any with quotes; or
// use `body = "json"` (auto-serializes RADIUS attributes with proper
// escaping) and update session-engine /api/auth to accept RADIUS-style
// attribute names (User-Name, User-Password, NAS-IP-Address, etc).
const REST_CONFIG = `
rest {
    # Connect to session-engine on localhost:3010 (no TLS)
    connect_uri = "http://localhost:3010"
    connect_timeout = 5.0

    # TLS settings — moot over plain HTTP, but included for completeness
    tls {
        check_cert = no
        check_cert_cn = no
    }

    # Authorize phase: POST /api/auth with JSON body.
    # The body uses camelCase keys matching session-engine /api/auth schema.
    # Values are expanded from RADIUS request attributes via xlat.
    authorize {
        method = "post"
        uri = "/api/auth"
        body = "json"
        timeout = 5.0
        data = '{"username":"%{User-Name}","password":"%{User-Password}","nasIp":"%{NAS-IP-Address}","nasPort":"%{NAS-Port}","callingStationId":"%{Calling-Station-Id}","calledStationId":"%{Called-Station-Id}"}'
    }

    # Authenticate phase: rlm_rest has no authenticate{} subsection —
    # the authorize call above is what triggers the HTTP request.
    # If session-engine returns 2xx, rlm_rest returns RLM_MODULE_OK
    # and FreeRADIUS proceeds to the post-auth phase. If 4xx, rlm_rest
    # returns RLM_MODULE_REJECT/FAIL and FreeRADIUS rejects the user.
}
`.trim();

// ─── Test client block ───────────────────────────────────────────
const TEST_CLIENT_BLOCK = `
# ── Added by configure-freeradius-rlm-rest.mjs ─────────────
# Test client for local RADIUS testing (radtest, radclient).
# Allows: radtest alice secret 127.0.0.1 0 testing123
client cryptsk-test {
    ipaddr = 127.0.0.1
    secret = "testing123"
    nas_type = "other"
    shortname = "cryptsk-test"
}
`.trim();

// ─── Helper: run a remote command and capture output ─────────────
function runCommand(conn, cmd, label = "") {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (d) => {
        stdout += d.toString();
      });
      stream.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      stream.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code, label });
      });
    });
  });
}

function banner(s) {
  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`  ${s}`);
  console.log(`────────────────────────────────────────────────────`);
}

// ─── Main ────────────────────────────────────────────────────────
const conn = new Client();

conn.on("ready", async () => {
  console.log("[configure-freeradius] Connected to prod 103.244.7.221:22222");

  try {
    // ── Step 1: Enable rest module ────────────────────────────
    banner("Step 1: Enable rlm_rest module (symlink mods-enabled/rest)");
    let r = await runCommand(
      conn,
      `ln -sf /etc/raddb/mods-available/rest /etc/raddb/mods-enabled/rest && ` +
        `ls -la /etc/raddb/mods-enabled/rest && echo "EXIT:$?"`,
      "enable-rest"
    );
    console.log(r.stdout || r.stderr);

    // ── Step 2: Backup + write new rlm_rest config ────────────
    banner("Step 2: Backup + rewrite /etc/raddb/mods-available/rest");
    const ts = "$(date +%Y%m%d-%H%M%S)";
    r = await runCommand(
      conn,
      `cp /etc/raddb/mods-available/rest /etc/raddb/mods-available/rest.bak.${ts} 2>/dev/null; ` +
        `cat > /etc/raddb/mods-available/rest << 'EOFRESTCONFIG'\n${REST_CONFIG}\nEOFRESTCONFIG\n` +
        `echo "---WRITTEN---"; head -50 /etc/raddb/mods-available/rest`,
      "write-rest-config"
    );
    console.log(r.stdout || r.stderr);

    // ── Step 3: Insert `rest` into authorize{} block ─────────
    banner("Step 3: Insert `rest` into authorize{} of sites-available/default");
    r = await runCommand(
      conn,
      `# Idempotent: skip if ` +
        `if grep -E '^[[:space:]]*rest[[:space:]]*(#.*)?$' /etc/raddb/sites-available/default > /dev/null 2>&1; then
           echo "rest already present in sites-available/default — skipping"
         else
           cp /etc/raddb/sites-available/default /etc/raddb/sites-available/default.bak.${ts}
           awk '
             /^[[:space:]]*authorize[[:space:]]*\\{/ {
               print
               print "\\trest  # P-NDPI-FREERADIUS: invoke rlm_rest to POST /api/auth on session-engine"
               next
             }
             { print }
           ' /etc/raddb/sites-available/default.bak.${ts} > /tmp/default.new && \\
           mv /tmp/default.new /etc/raddb/sites-available/default
           echo "rest added to authorize section of sites-available/default"
         fi
         echo "---AUTHORIZE-NOW---"
         awk '/^[[:space:]]*authorize[[:space:]]*\\{/,/^\\}/' /etc/raddb/sites-available/default | head -20`,
      "insert-rest-in-authorize"
    );
    console.log(r.stdout || r.stderr);

    // ── Step 4: Add test client to clients.conf ──────────────
    banner("Step 4: Add test client (localhost / testing123) to clients.conf");
    r = await runCommand(
      conn,
      `if grep -q "testing123" /etc/raddb/clients.conf 2>/dev/null; then
         echo "test client (secret=testing123) already present in clients.conf — skipping"
       else
         cp /etc/raddb/clients.conf /etc/raddb/clients.conf.bak.${ts} 2>/dev/null || true
         cat >> /etc/raddb/clients.conf << 'EOFCLIENTCONF'\n${TEST_CLIENT_BLOCK}\nEOFCLIENTCONF\n
         echo "test client added to clients.conf"
       fi
       echo "---CLIENTS-TAIL---"
       tail -15 /etc/raddb/clients.conf`,
      "add-test-client"
    );
    console.log(r.stdout || r.stderr);

    // ── Step 5: Validate config with radiusd -C ─────────────
    banner("Step 5: Validate configuration (radiusd -C)");
    r = await runCommand(
      conn,
      `radiusd -C 2>&1; echo "EXIT:$?"`,
      "radiusd-check"
    );
    console.log(r.stdout || r.stderr);
    const radiusdExitMatch = (r.stdout || "").match(/EXIT:(\d+)/);
    const radiusdExit = radiusdExitMatch ? parseInt(radiusdExitMatch[1], 10) : -1;

    // ── Summary ──────────────────────────────────────────────
    banner("Configuration Complete");
    if (radiusdExit === 0) {
      console.log("✅ radiusd -C succeeded — config is syntactically valid.");
    } else {
      console.log(
        `⚠️  radiusd -C exited with code ${radiusdExit} — review the output above for errors.`
      );
      console.log(
        "   Common issues: rlm_rest syntax errors, missing attribute refs in data template."
      );
    }
    console.log("\nNext steps (operator-run on prod):");
    console.log("  1. Review the new /etc/raddb/mods-available/rest file.");
    console.log("  2. Verify `rest` is in the authorize{} block:");
    console.log("       awk '/^authorize \\{/,/^\\}/' /etc/raddb/sites-available/default");
    console.log("  3. If satisfied, restart radiusd:");
    console.log("       systemctl restart radiusd");
    console.log("  4. Test with radtest (using the test client):");
    console.log("       radtest alice secret 127.0.0.1 0 testing123");
    console.log("  5. Check radiusd log for rlm_rest POST errors:");
    console.log("       journalctl -u radiusd -n 100 --no-pager");
    console.log("\nNOTE: session-engine /api/auth currently requires admin session cookie.");
    console.log("      The rlm_rest POST will receive 401 until session-engine is updated to");
    console.log("      accept machine-to-machine calls (e.g. via a shared-secret header).");
    console.log("      Track this as a follow-up task on session-engine.");

    conn.end();
    process.exit(radiusdExit === 0 ? 0 : 1);
  } catch (err) {
    console.error("[configure-freeradius] FATAL:", err?.message ?? String(err));
    conn.end();
    process.exit(2);
  }
});

conn.on("error", (e) => {
  console.error("[configure-freeradius] SSH error:", e.message);
  process.exit(1);
});

conn.connect(SSH_CONFIG);
console.log("[configure-freeradius] Connecting to prod 103.244.7.221:22222...");
