import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";

// GET /api/vpp — proxy to VPP adapter on port 3015
// Actions: ?action=status | config | interfaces | health
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.gateway", "read");

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "status";
    const subscriberId = searchParams.get("subscriberId");

    let path = "/status";
    if (action === "config") path = "/config/generate";
    else if (action === "interfaces") path = "/interfaces";
    else if (action === "health") path = "/health";
    else if (action === "subscriber" && subscriberId) path = `/config/subscriber/${subscriberId}`;

    try {
      const res = await fetch(`http://localhost:3015${path}`, {
        signal: req.signal,
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        return NextResponse.json({ error: "VPP adapter unavailable" }, { status: 502 });
      }

      const data = await res.json();
      return NextResponse.json(data);
    } catch (fetchErr: any) {
      return NextResponse.json(
        {
          error: "VPP adapter not running",
          detail: fetchErr.message,
          hint: "Start the VPP adapter: pm2 start ecosystem.config.cjs",
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
