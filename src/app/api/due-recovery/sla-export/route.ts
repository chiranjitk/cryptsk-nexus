import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

function getDefaultSlaDays(amount: number): number {
  if (amount < 5000) return 15;
  if (amount <= 25000) return 30;
  return 45;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();

    const slaRecords = await db.recoverySla.findMany({
      include: {
        Invoice: {
          select: {
            invoiceNumber: true,
            balanceAmount: true,
            dueDate: true,
            grandTotal: true,
            paidAmount: true,
            status: true,
          },
        },
        Subscriber: {
          select: { name: true, code: true, phone: true, Area: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const rows: string[][] = [
      [
        "SLA ID",
        "Invoice #",
        "Subscriber",
        "Code",
        "Area",
        "Outstanding Amount",
        "Total Amount",
        "Due Date",
        "SLA Target Days",
        "Custom SLA Days",
        "Actual Days",
        "Days Elapsed",
        "Days Remaining",
        "SLA Status",
        "SLA Paused",
        "Effective Due Date",
        "Escalated At",
        "Resolved At",
        "Created At",
      ],
    ];

    for (const sla of slaRecords) {
      const balanceAmount = sla.Invoice.balanceAmount || (sla.Invoice.grandTotal - sla.Invoice.paidAmount);
      const effectiveDays = sla.customSlaDays ?? sla.targetDays ?? getDefaultSlaDays(balanceAmount);
      const created = new Date(sla.createdAt);
      let effectiveDue = new Date(created);
      effectiveDue.setDate(effectiveDue.getDate() + effectiveDays);
      if (sla.slaPausedTotalMs > 0) effectiveDue.setTime(effectiveDue.getTime() + sla.slaPausedTotalMs);
      if (sla.slaDueDate) effectiveDue = new Date(sla.slaDueDate);

      let daysElapsed = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000));
      if (sla.slaPaused && sla.slaPausedAt) {
        const pausedMs = now.getTime() - new Date(sla.slaPausedAt).getTime();
        daysElapsed = Math.max(0, Math.floor((now.getTime() - created.getTime() - (sla.slaPausedTotalMs + pausedMs)) / 86400000));
      } else if (sla.slaPausedTotalMs > 0) {
        daysElapsed = Math.max(0, Math.floor((now.getTime() - created.getTime() - sla.slaPausedTotalMs) / 86400000));
      }
      const daysRemaining = Math.max(0, effectiveDays - daysElapsed);

      rows.push([
        sla.id,
        sla.Invoice.invoiceNumber,
        sla.Subscriber.name,
        sla.Subscriber.code,
        sla.Subscriber.Area?.name || "-",
        balanceAmount.toFixed(2),
        sla.Invoice.grandTotal.toFixed(2),
        new Date(sla.Invoice.dueDate).toLocaleDateString("en-IN"),
        String(effectiveDays),
        sla.customSlaDays ? String(sla.customSlaDays) : "-",
        String(sla.actualDays),
        String(daysElapsed),
        String(daysRemaining),
        sla.status,
        sla.slaPaused ? "Yes" : "No",
        effectiveDue.toLocaleDateString("en-IN"),
        sla.escalatedAt ? new Date(sla.escalatedAt).toLocaleDateString("en-IN") : "-",
        sla.resolvedAt ? new Date(sla.resolvedAt).toLocaleDateString("en-IN") : "-",
        sla.createdAt.toLocaleDateString("en-IN"),
      ]);
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const filename = `sla_report_${now.toISOString().split("T")[0]}.csv`;

    return new NextResponse(blob, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("SLA Export API error:", error);
    return NextResponse.json({ error: "Failed to export SLA report" }, { status: 500 });
  }
}
