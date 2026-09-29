import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/api-auth"

const GW = process.env.GATEWAY_SERVICE_URL || "http://localhost:3005"

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

  const url = new URL(req.url)
  const tool = url.searchParams.get("tool")

  // Map frontend tool queries to gateway-service endpoints
  let gwPath = "/api/diag"
  if (tool === "tcpdump") {
    // Check tcpdump status + captures
    const [statusRes, capturesRes] = await Promise.all([
      fetch(`${GW}/api/diag/tcpdump/status`, { headers: { Cookie: req.headers.get("Cookie") || "" } }).catch(() => null),
      fetch(`${GW}/api/diag/tcpdump/captures`, { headers: { Cookie: req.headers.get("Cookie") || "" } }).catch(() => null),
    ])
    const status = statusRes ? await statusRes.json().catch(() => ({ success: false })) : { success: false }
    const captures = capturesRes ? await capturesRes.json().catch(() => ({ data: [] })) : { data: [] }

    // Map Prisma fields to frontend-expected fields
    const mappedCaptures = (captures.data || []).map((c: any) => ({
      id: c.id,
      interface: c.targetInterface || "",
      filter: c.filterExpression || "",
      status: c.status || "STOPPED",
      startTime: c.startedAt || c.createdAt || "",
      stopTime: c.stoppedAt || "",
      fileSize: c.fileSizeBytes || 0,
      packetCount: c.packetsCaptured || c.packetCount || 0,
      snapshotLength: c.snapshotLength || 262144,
      fileName: c.captureFile || "",
    }))

    return NextResponse.json({
      captures: mappedCaptures,
      activeCapture: status.isRunning ? {
        active: true,
        interface: status.capture?.targetInterface || "",
        filter: status.capture?.filterExpression || "",
        startTime: status.capture?.startedAt || new Date().toISOString(),
        packetCount: status.packetCount || status.capture?.packetsCaptured || 0,
        captureId: status.capture?.id || "",
      } : null,
    })
  }

  if (tool === "arp") {
    const search = url.searchParams.get("search") || ""
    const res = await fetch(`${GW}/api/diag/arp-table`, { headers: { Cookie: req.headers.get("Cookie") || "" } })
    const data = await res.json()
    let entries = data.data || []
    if (search) {
      const s = search.toLowerCase()
      entries = entries.filter((e: any) => e.ip.toLowerCase().includes(s) || e.mac.toLowerCase().includes(s) || e.device.toLowerCase().includes(s))
    }
    return NextResponse.json({ entries, total: entries.length })
  }

  if (tool === "history") {
    const filter = url.searchParams.get("filter") || ""
    const page = url.searchParams.get("page") || "1"
    const res = await fetch(`${GW}/api/diag/captures?limit=50${filter && filter !== "All" ? `&tool=${filter}` : ""}`, { headers: { Cookie: req.headers.get("Cookie") || "" } })
    const data = await res.json()
    const entries = (data.data || []).map((c: any) => ({
      id: c.id,
      tool: (c.tool || "").toLowerCase(),
      target: c.targetHost || c.targetInterface || "",
      output: c.output || "",
      timestamp: c.startedAt || c.createdAt,
      status: c.status === "COMPLETED" ? "success" : c.status === "RUNNING" ? "running" : "failed",
      metadata: { durationMs: c.durationMs, exitCode: c.exitCode },
    }))
    return NextResponse.json({ entries, total: entries.length })
  }

  return NextResponse.json({ error: "Unknown tool" }, { status: 400 })
  } catch (error) {
    console.error("[GET /api/diag] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

  const body = await req.json()
  const { tool, action } = body

  const cookieHeader = { Cookie: req.headers.get("Cookie") || "" }
  const gwHeaders = { "Content-Type": "application/json", ...cookieHeader }

  // TCPDump start
  if (tool === "tcpdump" && action === "start") {
    const res = await fetch(`${GW}/api/diag/tcpdump/start`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({
        targetInterface: body.interface || "eth0",
        filterExpression: body.filter || "",
        packetCount: body.count || 100,
        snapshotLength: body.snapshotLength || 262144,
      }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }

  // TCPDump stop
  if (tool === "tcpdump" && action === "stop") {
    const res = await fetch(`${GW}/api/diag/tcpdump/stop`, { method: "POST", headers: gwHeaders })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }

  // Ping
  if (tool === "ping") {
    const res = await fetch(`${GW}/api/diag/ping`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({
        targetHost: body.host,
        count: body.count || 4,
        interface: body.interface || "",
      }),
    })
    const data = await res.json()
    if (data.success && data.data) {
      return NextResponse.json({
        success: true,
        output: data.data.output || "",
        host: body.host,
        count: body.count || 4,
        interface: body.interface || "",
        sent: data.data.parsed?.sent || 0,
        received: data.data.parsed?.received || 0,
        loss: data.data.parsed?.loss || 0,
        minRtt: data.data.parsed?.minRtt || 0,
        avgRtt: data.data.parsed?.avgRtt || 0,
        maxRtt: data.data.parsed?.maxRtt || 0,
        method: data.data.method || "icmp",
        id: data.data.id,
        timestamp: new Date().toISOString(),
      })
    }
    return NextResponse.json(data, { status: res.status })
  }

  // Traceroute
  if (tool === "traceroute") {
    const res = await fetch(`${GW}/api/diag/traceroute`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({
        targetHost: body.host,
        maxHops: body.maxHops || 30,
      }),
    })
    const data = await res.json()
    if (data.success && data.data) {
      return NextResponse.json({
        success: true,
        output: data.data.output || "",
        host: body.host,
        maxHops: body.maxHops || 30,
        hopCount: data.data.parsed?.hopCount || 0,
        timestamp: new Date().toISOString(),
        id: data.data.id,
      })
    }
    return NextResponse.json(data, { status: res.status })
  }

  // NSLookup
  if (tool === "nslookup") {
    const res = await fetch(`${GW}/api/diag/nslookup`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({
        domain: body.domain,
        dnsServer: body.server || "",
      }),
    })
    const data = await res.json()
    if (data.success && data.data) {
      return NextResponse.json({
        success: true,
        output: data.data.output || "",
        domain: body.domain,
        tool: "nslookup",
        timestamp: new Date().toISOString(),
        id: data.data.id,
      })
    }
    return NextResponse.json(data, { status: res.status })
  }

  // Dig
  if (tool === "dig") {
    const res = await fetch(`${GW}/api/diag/dig`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({
        domain: body.domain,
        recordType: body.recordType || "A",
        dnsServer: body.server || "",
      }),
    })
    const data = await res.json()
    if (data.success && data.data) {
      return NextResponse.json({
        success: true,
        output: data.data.output || "",
        domain: body.domain,
        recordType: body.recordType || "A",
        tool: "dig",
        timestamp: new Date().toISOString(),
        id: data.data.id,
      })
    }
    return NextResponse.json(data, { status: res.status })
  }

  // ARP Flush
  if (tool === "arp" && action === "flush") {
    const res = await fetch(`${GW}/api/diag/arp-flush`, {
      method: "POST", headers: gwHeaders,
      body: JSON.stringify({ interface: body.interface || "all" }),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json({ error: "Unknown tool/action" }, { status: 400 })
  } catch (error) {
    console.error("[POST /api/diag] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

  const url = new URL(req.url)
  const cookieHeader = { Cookie: req.headers.get("Cookie") || "" }

  // Delete specific capture by ID
  const captureMatch = url.pathname.match(/\/api\/diag\/tcpdump\/captures\/([^/]+)$/)
  if (captureMatch) {
    const id = captureMatch[1]
    // Delete single capture from gateway
    const res = await fetch(`${GW}/api/diag/tcpdump/captures/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...cookieHeader },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }

  // Bulk cleanup all completed captures
  const res = await fetch(`${GW}/api/diag/tcpdump/captures`, { method: "DELETE", headers: cookieHeader })
  return NextResponse.json(await res.json(), { status: res.status })
  } catch (error) {
    console.error("[DELETE /api/diag] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
