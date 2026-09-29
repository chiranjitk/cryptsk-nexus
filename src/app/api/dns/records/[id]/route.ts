import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditDelete } from "@/lib/audit";

// DELETE /api/dns/records/[id] — delete a DNS record
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("dns", "delete");
    const { id } = await params;

    const existing = await db.dnsRecord.findUnique({
      where: { id },
      include: { zone: { select: { zoneName: true } } },
    });
    if (!existing) return NextResponse.json({ error: "DNS record not found" }, { status: 404 });

    await db.dnsRecord.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "dns_record",
      resourceId: id, resourceName: `${existing.recordType} ${existing.hostname}`,
      before: { zoneId: existing.zoneId, zoneName: existing.zone?.zoneName, hostname: existing.hostname, recordType: existing.recordType, value: existing.value },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete DNS record" }, { status: 500 });
  }
}
