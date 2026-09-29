// ============================================================
// CRYPTSK Nexus — RADIUS session serializer
// Shared by /api/sessions route handlers.
// RadAcct uses BigInt columns (radacctid, octets, sessiontime)
// which JSON.stringify cannot serialize — convert here.
// ============================================================

export type SerializedSession = {
  radacctid: string;
  acctsessionid: string;
  acctuniqueid: string;
  username: string | null;
  groupname: string | null;
  realm: string | null;
  nasipaddress: string;
  nasportid: string | null;
  nasporttype: string | null;
  framedipaddress: string;
  framedprotocol: string | null;
  callingstationid: string | null;
  calledstationid: string | null;
  acctstarttime: string | null;
  acctupdatetime: string | null;
  acctstoptime: string | null;
  acctsessiontime: number | null;
  acctinputoctets: number; // bytes received FROM the subscriber (upload)
  acctoutputoctets: number; // bytes sent TO the subscriber (download)
  acctterminatecause: string | null;
  servicetype: string | null;
  status: "active" | "stopped";
  /** Active sessions: seconds elapsed since acctstarttime, computed server-side */
  liveDurationSec: number | null;
};

// Shape of a Prisma RadAcct row (subset actually used)
type RadAcctRow = {
  radacctid: bigint;
  acctsessionid: string;
  acctuniqueid: string;
  username: string | null;
  groupname: string | null;
  realm: string | null;
  nasipaddress: string;
  nasportid: string | null;
  nasporttype: string | null;
  framedipaddress: string;
  framedprotocol: string | null;
  callingstationid: string | null;
  calledstationid: string | null;
  acctstarttime: Date | null;
  acctupdatetime: Date | null;
  acctstoptime: Date | null;
  acctsessiontime: bigint | null;
  acctinputoctets: bigint | null;
  acctoutputoctets: bigint | null;
  acctterminatecause: string | null;
  servicetype: string | null;
};

function toNum(v: bigint | null | undefined): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function serializeSession(row: RadAcctRow): SerializedSession {
  const active = row.acctstoptime === null;
  const liveDurationSec = active && row.acctstarttime
    ? Math.max(0, Math.floor((Date.now() - row.acctstarttime.getTime()) / 1000))
    : null;

  return {
    radacctid: row.radacctid.toString(),
    acctsessionid: row.acctsessionid,
    acctuniqueid: row.acctuniqueid,
    username: row.username,
    groupname: row.groupname,
    realm: row.realm,
    nasipaddress: row.nasipaddress,
    nasportid: row.nasportid,
    nasporttype: row.nasporttype,
    framedipaddress: row.framedipaddress,
    framedprotocol: row.framedprotocol,
    callingstationid: row.callingstationid,
    calledstationid: row.calledstationid,
    acctstarttime: toIso(row.acctstarttime),
    acctupdatetime: toIso(row.acctupdatetime),
    acctstoptime: toIso(row.acctstoptime),
    acctsessiontime: row.acctsessiontime === null ? null : toNum(row.acctsessiontime),
    acctinputoctets: toNum(row.acctinputoctets),
    acctoutputoctets: toNum(row.acctoutputoctets),
    acctterminatecause: row.acctterminatecause,
    servicetype: row.servicetype,
    status: active ? "active" : "stopped",
    liveDurationSec,
  };
}

/** Parse a radacctid path/query parameter. Returns null when invalid. */
export function parseRadAcctId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}
