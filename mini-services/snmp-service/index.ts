import http from "http";
import snmp from "net-snmp";

const PORT = 3020;
const SNMP_TIMEOUT = 5000;

// ─── Safe session close (net-snmp has issues with Node 24 dgram) ─
function safeClose(session: { close: () => void }) {
  try { session.close(); } catch { /* ignore dgram errors */ }
}

// ─── Promisified helpers ─────────────────────────────────────────

function snmpGet(host: string, community: string, version: string, oid: string) {
  const ver = version === "1" ? snmp.Version1 : snmp.Version2c;
  const session = snmp.createSession(host, community, { version: ver, timeout: SNMP_TIMEOUT });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { safeClose(session); reject(new Error("SNMP request timed out")); }, SNMP_TIMEOUT + 1000);
    session.get([oid], (error: Error | null, varbinds: unknown) => {
      clearTimeout(timer);
      safeClose(session);
      if (error) return reject(error);
      resolve(varbinds);
    });
  });
}

function snmpGetNext(host: string, community: string, version: string, oid: string) {
  const ver = version === "1" ? snmp.Version1 : snmp.Version2c;
  const session = snmp.createSession(host, community, { version: ver, timeout: SNMP_TIMEOUT });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { safeClose(session); reject(new Error("SNMP request timed out")); }, SNMP_TIMEOUT + 1000);
    session.getNext(oid, (error: Error | null, varbinds: unknown) => {
      clearTimeout(timer);
      safeClose(session);
      if (error) return reject(error);
      resolve(varbinds);
    });
  });
}

function snmpGetBulk(host: string, community: string, version: string, oids: string[], maxRepetitions = 10) {
  const ver = version === "1" ? snmp.Version1 : snmp.Version2c;
  const session = snmp.createSession(host, community, { version: ver, timeout: SNMP_TIMEOUT });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { safeClose(session); reject(new Error("SNMP request timed out")); }, SNMP_TIMEOUT + 1000);
    session.getBulk(oids, maxRepetitions, (error: Error | null, varbinds: unknown) => {
      clearTimeout(timer);
      safeClose(session);
      if (error) return reject(error);
      resolve(varbinds);
    });
  });
}

function snmpWalk(host: string, community: string, version: string, oid: string) {
  const ver = version === "1" ? snmp.Version1 : snmp.Version2c;
  const session = snmp.createSession(host, community, { version: ver, timeout: SNMP_TIMEOUT });
  return new Promise((resolve, reject) => {
    const results: { oid: string; type: number; value: unknown }[] = [];
    const timer = setTimeout(() => { safeClose(session); reject(new Error("SNMP walk timed out")); }, SNMP_TIMEOUT + 2000);
    session.walk(oid, 10,
      (error: Error | null, varbind: { oid: string; type: number; value: unknown }) => {
        if (error) {
          clearTimeout(timer);
          safeClose(session);
          if (results.length > 0) return resolve(results);
          return reject(error);
        }
        results.push(varbind);
      },
      () => {
        clearTimeout(timer);
        safeClose(session);
        resolve(results);
      },
    );
  });
}

// ─── Utility ─────────────────────────────────────────────────────

function formatVarbind(vb: { oid: string; type: number; value: unknown }) {
  const isBuffer = Buffer.isBuffer(vb.value);
  return {
    oid: vb.oid,
    type: vb.type,
    typeName: (snmp as Record<string, unknown>).ObjectType ? (snmp.ObjectType as Record<number, string>)[vb.type] || `Unknown(${vb.type})` : `Type(${vb.type})`,
    value: isBuffer ? (vb.value as Buffer).toString("utf8").replace(/\0/g, "") : String(vb.value),
  };
}

function formatSpeed(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(0)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(0)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function formatMac(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.length >= 12) return raw.match(/.{2}/g)?.join(":").toUpperCase() || raw;
  return raw;
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

// ─── Request handler ─────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }

  if (req.method !== "POST") return json(res, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
      req.on("error", reject);
    });
  } catch { body = {}; }

  const { action } = body;

  try {
    switch (action) {
      case "get": {
        const { host, community, version = "2c", oid } = body as Record<string, string>;
        if (!host || !community || !oid) return json(res, { error: "host, community, and oid are required" }, 400);
        const varbinds: unknown[] = await snmpGet(host, community, version, oid) as unknown[];
        return json(res, { success: true, data: varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0])) });
      }
      case "getNext": {
        const { host, community, version = "2c", oid } = body as Record<string, string>;
        if (!host || !community || !oid) return json(res, { error: "host, community, and oid are required" }, 400);
        const varbinds: unknown[] = await snmpGetNext(host, community, version, oid) as unknown[];
        return json(res, { success: true, data: varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0])) });
      }
      case "getBulk": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        const oids = body.oids as string[];
        if (!host || !community || !oids?.length) return json(res, { error: "host, community, and oids are required" }, 400);
        const varbinds: unknown[] = await snmpGetBulk(host, community, version, oids) as unknown[];
        return json(res, { success: true, data: varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0])) });
      }
      case "walk": {
        const { host, community, version = "2c", oid } = body as Record<string, string>;
        if (!host || !community || !oid) return json(res, { error: "host, community, and oid are required" }, 400);
        const varbinds: unknown[] = await snmpWalk(host, community, version, oid) as unknown[];
        return json(res, { success: true, data: varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0])) });
      }
      case "getSystemInfo": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        if (!host || !community) return json(res, { error: "host and community are required" }, 400);
        const systemOids = ["1.3.6.1.2.1.1.1", "1.3.6.1.2.1.1.5", "1.3.6.1.2.1.1.3", "1.3.6.1.2.1.1.4", "1.3.6.1.2.1.1.6", "1.3.6.1.2.1.1.7"];
        const varbinds: unknown[] = await snmpGetBulk(host, community, version, systemOids, 1) as unknown[];
        const mapped = varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0]));
        const getValue = (oidSuffix: string) => { const found = mapped.find((v) => v.oid === oidSuffix); return found ? String(found.value) : ""; };
        return json(res, { success: true, data: { sysDescr: getValue("1.3.6.1.2.1.1.1.0"), sysName: getValue("1.3.6.1.2.1.1.5.0"), sysUpTime: getValue("1.3.6.1.2.1.1.3.0"), sysContact: getValue("1.3.6.1.2.1.1.4.0"), sysLocation: getValue("1.3.6.1.2.1.1.6.0"), sysServices: getValue("1.3.6.1.2.1.1.7.0") } });
      }
      case "getInterfaces": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        if (!host || !community) return json(res, { error: "host and community are required" }, 400);
        const [descriptions, types, speeds, macs, adminStatuses, operStatuses] = await Promise.all([
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.2").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.3").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.5").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.6").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.7").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.8").catch(() => []),
        ]);
        const [inOctets, outOctets] = await Promise.all([
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.10").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.2.1.2.2.1.16").catch(() => []),
        ]);
        const byIndex: Record<number, Record<string, string>> = {};
        function addToGroup(varbinds: unknown[], key: string) {
          (varbinds as { oid: string; value: unknown }[]).forEach((vb) => {
            const parts = vb.oid.split(".");
            const idx = parseInt(parts[parts.length - 1], 10);
            if (!byIndex[idx]) byIndex[idx] = {};
            const isBuf = Buffer.isBuffer(vb.value);
            byIndex[idx][key] = isBuf ? (vb.value as Buffer).toString("utf8").replace(/\0/g, "") : String(vb.value);
          });
        }
        addToGroup(descriptions, "description");
        addToGroup(types, "type");
        addToGroup(speeds, "speed");
        addToGroup(macs, "mac");
        addToGroup(adminStatuses, "adminStatus");
        addToGroup(operStatuses, "operStatus");
        addToGroup(inOctets, "inOctets");
        addToGroup(outOctets, "outOctets");
        const ifTypes: Record<string, string> = { "1": "Other", "2": "Regular1822", "6": "Ethernet", "23": "PPP", "24": "Loopback", "37": "ATM", "71": "WiFi", "135": "VLAN", "150": "LAG" };
        const interfaces = Object.entries(byIndex).map(([idx, data]) => ({
          index: idx, description: data.description || "", type: data.type || "",
          typeName: ifTypes[data.type] || `Type ${data.type}`, speed: data.speed || "0",
          speedFormatted: formatSpeed(parseInt(data.speed, 10) || 0), mac: formatMac(data.mac),
          adminStatus: data.adminStatus === "1" ? "up" : "down", operStatus: data.operStatus === "1" ? "up" : "down",
          inOctets: data.inOctets || "0", outOctets: data.outOctets || "0",
        }));
        return json(res, { success: true, data: interfaces });
      }
      case "getCPU": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        if (!host || !community) return json(res, { error: "host and community are required" }, 400);
        const cpuOids = ["1.3.6.1.4.1.2021.11.9", "1.3.6.1.2.1.25.3.3.1.2"];
        const allResults: { oid: string; value: string }[] = [];
        for (const oid of cpuOids) {
          try {
            const varbinds: unknown[] = await snmpWalk(host, community, version, oid) as unknown[];
            varbinds.forEach((vb: unknown) => {
              const v = vb as { oid: string; value: unknown };
              allResults.push({ oid: v.oid, value: Buffer.isBuffer(v.value) ? (v.value as Buffer).toString("utf8") : String(v.value) });
            });
          } catch { /* OID not supported */ }
        }
        let cpuLoad = -1;
        const multiCore: { index: string; load: number }[] = [];
        for (const r of allResults) {
          if (r.oid.startsWith("1.3.6.1.4.1.2021.11.9.")) cpuLoad = 100 - (parseInt(r.value, 10) || 0);
          else if (r.oid.startsWith("1.3.6.1.2.1.25.3.3.1.2.")) {
            const parts = r.oid.split(".");
            multiCore.push({ index: parts[parts.length - 1], load: parseInt(r.value, 10) || 0 });
          }
        }
        if (multiCore.length > 0) cpuLoad = Math.round(multiCore.reduce((s, c) => s + c.load, 0) / multiCore.length);
        return json(res, { success: true, data: { cpuLoad, cores: multiCore.length || 1, multiCore } });
      }
      case "getMemory": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        if (!host || !community) return json(res, { error: "host and community are required" }, 400);
        const memOids = ["1.3.6.1.4.1.2021.4.3", "1.3.6.1.4.1.2021.4.4", "1.3.6.1.4.1.2021.4.5", "1.3.6.1.4.1.2021.4.6", "1.3.6.1.4.1.2021.4.14", "1.3.6.1.4.1.2021.4.15"];
        const varbinds: unknown[] = await snmpGetBulk(host, community, version, memOids, 1) as unknown[];
        const mapped = varbinds.map((v) => formatVarbind(v as Parameters<typeof formatVarbind>[0]));
        const getValue = (oidSuffix: string) => { const found = mapped.find((v) => v.oid === oidSuffix); return found ? parseInt(String(found.value), 10) || 0 : 0; };
        const totalSwap = getValue("1.3.6.1.4.1.2021.4.3.0");
        const availSwap = getValue("1.3.6.1.4.1.2021.4.4.0");
        const totalReal = getValue("1.3.6.1.4.1.2021.4.5.0");
        const availReal = getValue("1.3.6.1.4.1.2021.4.6.0");
        const buffers = getValue("1.3.6.1.4.1.2021.4.14.0");
        const cached = getValue("1.3.6.1.4.1.2021.4.15.0");
        const usedReal = totalReal - availReal;
        const usedPercent = totalReal > 0 ? Math.round((usedReal / totalReal) * 100) : 0;
        return json(res, { success: true, data: { totalReal, availReal, usedReal, usedPercent, totalSwap, availSwap, usedSwap: totalSwap - availSwap, buffers, cached } });
      }
      case "getDisk": {
        const { host, community, version = "2c" } = body as Record<string, string>;
        if (!host || !community) return json(res, { error: "host and community are required" }, 400);
        const [paths, totals, useds, avails] = await Promise.all([
          snmpWalk(host, community, version, "1.3.6.1.4.1.2021.9.1.2").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.4.1.2021.9.1.6").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.4.1.2021.9.1.8").catch(() => []),
          snmpWalk(host, community, version, "1.3.6.1.4.1.2021.9.1.7").catch(() => []),
        ]);
        function extractByIndex(varbinds: unknown[]): Record<number, string> {
          const result: Record<number, string> = {};
          (varbinds as { oid: string; value: unknown }[]).forEach((vb) => {
            const parts = vb.oid.split(".");
            const idx = parseInt(parts[parts.length - 1], 10);
            const isBuf = Buffer.isBuffer(vb.value);
            result[idx] = isBuf ? (vb.value as Buffer).toString("utf8").replace(/\0/g, "") : String(vb.value);
          });
          return result;
        }
        const pathMap = extractByIndex(paths);
        const totalMap = extractByIndex(totals);
        const usedMap = extractByIndex(useds);
        const availMap = extractByIndex(avails);
        const disks: { index: string; path: string; device: string; total: number; used: number; avail: number; usedPercent: number }[] = [];
        for (const [idx, path] of Object.entries(pathMap)) {
          const total = parseInt(totalMap[idx] || "0", 10);
          const used = parseInt(usedMap[idx] || "0", 10);
          const avail = parseInt(availMap[idx] || "0", 10);
          disks.push({ index: idx, path, device: "", total, used, avail, usedPercent: total > 0 ? Math.round((used / total) * 100) : 0 });
        }
        return json(res, { success: true, data: disks });
      }
      default:
        return json(res, { error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return json(res, { error: msg }, 500);
  }
}

// ─── Start server ────────────────────────────────────────────────

// Prevent crashes from net-snmp dgram errors on Node.js 24
process.on("uncaughtException", (err) => {
  console.error("[snmp-service] Uncaught exception (suppressed):", err.message);
});

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`SNMP Service running on port ${PORT}`);
});
