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
// Body mapping (FIX #1 — switch to body="json" auto-serialization):
//   We use `body = "json"` and DO NOT specify a `data` template.
//   rlm_rest will auto-serialize ALL RADIUS request attributes
//   (User-Name, User-Password, NAS-IP-Address, NAS-Port,
//   Calling-Station-Id, Called-Station-Id, etc.) as JSON keys with
//   PROPER ESCAPING. This fixes the malformed-JSON bug where the
//   previous `data` xlat template emitted raw values, breaking on
//   passwords containing double-quotes or backslashes.
//
// Shared secret (rlm_rest cannot easily add custom HTTP headers):
//   Passed via the URI query string as ?_radiusSecret=...
//   The session-engine /api/radius/auth handler checks:
//     1. X-RADIUS-Secret header (preferred when supported)
//     2. _radiusSecret URL query parameter (used here)
//     3. _radiusSecret JSON body field (legacy fallback)
//
// Auth-Type Accept (FIX #2 — bypass authenticate{}):
//   When session-engine returns 2xx with a JSON body containing
//   {radius:{control:{Auth-Type:"Accept"}, reply:{...}}}, rlm_rest
//   maps the response back to RADIUS reply/control items. Combined
//   with the `if (ok) { update control { Auth-Type := Accept } }`
//   block injected into sites-available/default authorize{}
//   (see Step 3 below), this bypasses the authenticate{} section
//   entirely — no pap/mschap fallback needed.
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

    # Authorize phase: POST /api/radius/auth with JSON body.
    # body = "json" → rlm_rest auto-serializes ALL RADIUS request
    # attributes (User-Name, User-Password, NAS-IP-Address,
    # Calling-Station-Id, Called-Station-Id, etc.) as JSON keys
    # with proper escaping. No 'data' template required.
    #
    # The session-engine /api/radius/auth handler accepts BOTH
    # camelCase (legacy) AND RADIUS attribute names (User-Name,
    # NAS-IP-Address, etc.).
    #
    # _radiusSecret passed via query string (rlm_rest cannot easily
    # add custom HTTP headers via its config).
    authorize {
        method = "post"
        uri = "/api/radius/auth?_radiusSecret=cryptsk-radius-shared-secret-2026"
        body = "json"
        timeout = 5.0
        # No 'data' template — rlm_rest auto-serializes RADIUS attrs.
    }

    # Authenticate phase: rlm_rest has no authenticate{} subsection.
    # The authorize call above triggers the HTTP request.
    #   HTTP 2xx + JSON {radius:{control, reply}} → rlm_rest returns
    #     RLM_MODULE_OK and maps response attrs back to RADIUS items.
    #     The injected 'if (ok)' block in sites-available/default
    #     sets control:Auth-Type := Accept → skips authenticate{}.
    #   HTTP 4xx/5xx → rlm_rest returns RLM_MODULE_NOTFOUND/FAIL →
    #     falls through to sql + pap fallback in authorize/authenticate.
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

    // ── Step 3: Insert `rest` + `if (ok) { Auth-Type := Accept }`
    //            block at the TOP of authorize{} (FIX #2 + FIX #3).
    //            rlm_rest must run BEFORE sql so it can short-circuit
    //            authorization (when session-engine returns 200 with
    //            Auth-Type=Accept in the JSON response, we bypass
    //            the authenticate{} section entirely).
    banner("Step 3: Insert `rest` + `if (ok) { Auth-Type := Accept }` block at top of authorize{}");
    r = await runCommand(
      conn,
      `# Idempotent: skip if our marker block already present
       if grep -q "CRYPTSK-RLMREST-AUTHOK" /etc/raddb/sites-available/default 2>/dev/null; then
         echo "rest + Auth-Type Accept block already present in sites-available/default — skipping"
       else
         cp /etc/raddb/sites-available/default /etc/raddb/sites-available/default.bak.${ts}
         # awk: insert rest + if(ok){Auth-Type:=Accept} block immediately after
         # 'authorize {', and skip any pre-existing standalone 'rest' line
         # inside the authorize{} section (so re-running the script after a
         # previous, older-style insertion doesn't leave duplicates).
         awk '
           BEGIN { in_auth = 0 }
           /^[[:space:]]*authorize[[:space:]]*\\{/ {
             in_auth = 1
             print
             print "\\trest  # CRYPTSK rlm_rest: POST /api/radius/auth on session-engine"
             print "\\tif (ok) {"
             print "\\t\\tupdate control {"
             print "\\t\\t\\tAuth-Type := Accept"
             print "\\t\\t}"
             print "\\t}"
             print "\\t# CRYPTSK-RLMREST-AUTHOK (marker for idempotency)"
             next
           }
           in_auth && /^[[:space:]]*rest[[:space:]]*(#.*)?$/ { next }
           /^\\}/ { in_auth = 0 }
           { print }
         ' /etc/raddb/sites-available/default.bak.${ts} > /tmp/default.new && \\
         mv /tmp/default.new /etc/raddb/sites-available/default
         echo "rest + Auth-Type Accept block inserted at top of authorize section of sites-available/default"
       fi
       echo "---AUTHORIZE-NOW---"
       awk '/^[[:space:]]*authorize[[:space:]]*\\{/,/^\\}/' /etc/raddb/sites-available/default | head -25`,
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
        "   Common issues: rlm_rest syntax errors, unbalanced braces in sites-available/default, missing freeradius-rest package."
      );
    }
    console.log("\nNext steps (operator-run on prod):");
    console.log("  1. Review the new /etc/raddb/mods-available/rest file.");
    console.log("  2. Verify `rest` + `if (ok)` block is at the top of authorize{}:");
    console.log("       awk '/^authorize \\{/,/^\\}/' /etc/raddb/sites-available/default | head -25");
    console.log("  3. If satisfied, restart radiusd:");
    console.log("       systemctl restart radiusd");
    console.log("  4. Test with radtest (using the test client):");
    console.log("       radtest rajesh.kumar Cryptsk@003 127.0.0.1:1812 0 testing123");
    console.log("  5. Check radiusd log for rlm_rest POST errors:");
    console.log("       journalctl -u radiusd -n 100 --no-pager");
    console.log("\nNOTE: session-engine /api/radius/auth accepts BOTH camelCase AND");
    console.log("      RADIUS attribute names (User-Name, NAS-IP-Address, etc.). The");
    console.log("      shared secret is passed via the URI query string");
    console.log("      (?_radiusSecret=...). Response includes a `radius` object");
    console.log("      with control.Auth-Type=Accept + reply items (Framed-IP-Address,");
    console.log("      Session-Timeout, Mikrotik-Rate-Limit, Idle-Timeout) that rlm_rest");
    console.log("      maps back to RADIUS reply attributes.");

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
