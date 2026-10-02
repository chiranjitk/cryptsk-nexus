// GET /api/reports/statement-of-account — Statement of Account (Task 3-a, Phase 2)
//
// Two modes, switched by presence of `subscriberId`:
//  - Mode A (REGISTER, no subscriberId): per-subscriber aggregate over a date range
//    (default month-start → today-end). Billed from non-cancelled invoices,
//    collected from VERIFIED payments; outstanding = max(0, billed − collected).
//  - Mode B (LEDGER, subscriberId given): per-subscriber chronological ledger of
//    invoices (debit) + payments (credit) with running balance. Default ALL-TIME;
//    from/to narrow the window when provided.
//
// Filters: from,to (YYYY-MM-DD) | areaId (register mode, via Subscriber.areaId) |
//          q (register mode only — subscriber code/name contains)
// Doctrine: CANCELLED invoices never enter money totals. FAILED payments ignored.
// Row caps: 2000 rows (register) / 2000 entries (ledger). BigInt/Decimal → Number at edge.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { auditExport } from "@/lib/services/audit-service";

const MAX_ROWS = 2000;

// ── Helpers (per-file copies, Phase 1 doctrine) ────────────────────

/** BigInt/Decimal → Number at the edge. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Validate a YYYY-MM-DD string → Date at local midnight, else null. */
function parseYmd(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one in CSVs). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    const subscriberId = (searchParams.get("subscriberId") || "").trim();
    const fromParam = parseYmd(searchParams.get("from"));
    const toParam = parseYmd(searchParams.get("to"));
    const areaId = (searchParams.get("areaId") || "").trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const format = (searchParams.get("format") || "").toLowerCase();

    // ── Mode B: LEDGER (subscriberId present) ────────────────────────
    if (subscriberId) {
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          balance: true,
          activationDate: true,
          Plan: { select: { name: true, priceMonthly: true } },
          Area: { select: { name: true } },
        },
      });
      if (!subscriber) {
        return NextResponse.json(
          { success: false, error: "Subscriber not found" },
          { status: 404 }
        );
      }

      // Date window: from/to when given, else ALL-TIME (null = unbounded)
      const fromStart = fromParam; // local midnight
      const toEnd = toParam ? endOfDay(toParam) : null;
      const hasWindow = fromStart !== null || toEnd !== null;

      const windowFilter: { gte?: Date; lte?: Date } = {};
      if (fromStart) windowFilter.gte = fromStart;
      if (toEnd) windowFilter.lte = toEnd;

      const [invoices, payments] = await Promise.all([
        db.invoice.findMany({
          where: {
            subscriberId,
            status: { not: "CANCELLED" },
            ...(hasWindow ? { issueDate: windowFilter } : {}),
          },
          select: { issueDate: true, invoiceNumber: true, description: true, grandTotal: true },
          orderBy: { issueDate: "asc" },
          take: MAX_ROWS,
        }),
        db.payment.findMany({
          where: {
            subscriberId,
            status: { not: "FAILED" },
            ...(hasWindow ? { createdAt: windowFilter } : {}),
          },
          select: {
            createdAt: true,
            amount: true,
            status: true,
            paymentMode: true,
            receiptNumber: true,
            transactionRef: true,
          },
          orderBy: { createdAt: "asc" },
          take: MAX_ROWS,
        }),
      ]);

      type Entry = {
        date: Date;
        type: "INVOICE" | "PAYMENT" | "REFUND";
        reference: string;
        description: string;
        debit: number;
        credit: number;
      };
      const entries: Entry[] = [];

      let totalBilled = 0;
      let totalPaid = 0; // VERIFIED payments only (consistent with register-mode "collected")

      for (const inv of invoices) {
        const debit = round2(num(inv.grandTotal));
        totalBilled += debit;
        entries.push({
          date: new Date(inv.issueDate),
          type: "INVOICE",
          reference: inv.invoiceNumber,
          description: inv.description || `Invoice ${inv.invoiceNumber}`,
          debit,
          credit: 0,
        });
      }
      for (const pay of payments) {
        const amount = round2(num(pay.amount));
        if (pay.status === "VERIFIED") totalPaid += amount;
        const isRefund = pay.status === "REFUNDED";
        entries.push({
          date: new Date(pay.createdAt),
          type: isRefund ? "REFUND" : "PAYMENT",
          reference: pay.receiptNumber || pay.transactionRef || "",
          // Brief: payment description "Payment via <mode>"; REFUND rows mirror it
          description: `${isRefund ? "Refund" : "Payment"} via ${String(pay.paymentMode).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`,
          debit: isRefund ? amount : 0,
          credit: isRefund ? 0 : amount,
        });
      }

      // Merge chronological; running balance = cumulative (debit − credit)
      entries.sort((a, b) => a.date.getTime() - b.date.getTime());
      let running = 0;
      const withBalance = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, balance: round2(running) };
      });

      // Cap: keep the MOST RECENT 2000 entries — balances stay correct because
      // the running balance was computed across the full set before capping.
      const capped =
        withBalance.length > MAX_ROWS ? withBalance.slice(-MAX_ROWS) : withBalance;

      const totalOutstanding = Math.max(0, round2(totalBilled - totalPaid));
      const summary = {
        from: fromStart ? ymd(fromStart) : null,
        to: toEnd ? ymd(toEnd) : null,
        allTime: !hasWindow,
        totalBilled: round2(totalBilled),
        totalPaid: round2(totalPaid),
        totalOutstanding,
        walletBalance: round2(num(subscriber.balance)),
        entryCount: capped.length,
      };

      const subscriberShape = {
        code: subscriber.code,
        name: subscriber.name,
        phone: subscriber.phone,
        email: subscriber.email,
        status: subscriber.status,
        plan: subscriber.Plan?.name ?? "",
        area: subscriber.Area?.name ?? "",
        activationDate: subscriber.activationDate
          ? new Date(subscriber.activationDate).toISOString()
          : null,
      };

      const jsonEntries = capped.map((e) => ({
        date: e.date.toISOString(),
        type: e.type,
        reference: e.reference,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
        balance: e.balance,
      }));

      // CSV / XLSX export branch (ledger view)
      if (format === "csv" || format === "xlsx") {
        const headers = ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
        const rows: (string | number)[][] = capped.map((e) => [
          ymd(e.date),
          e.type,
          e.reference,
          e.description,
          e.debit,
          e.credit,
          e.balance,
        ]);
        await auditExport(request, "Statement", format, rows.length);
        const filename = generateExportFilename("statement-of-account", format);
        return format === "xlsx"
          ? xlsxResponse(headers, rows, filename)
          : csvResponse(headers, rows, filename);
      }

      return NextResponse.json({
        success: true,
        data: { summary, subscriber: subscriberShape, entries: jsonEntries },
      });
    }

    // ── Mode A: REGISTER (no subscriberId) ──────────────────────────
    const from = fromParam ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(toParam ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()));

    const [invoices, payments] = await Promise.all([
      db.invoice.findMany({
        where: { issueDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: {
          Subscriber: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              balance: true,
              areaId: true,
              Area: { select: { name: true } },
              Plan: { select: { name: true } },
            },
          },
        },
        take: MAX_ROWS,
      }),
      db.payment.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: "FAILED" } },
        // Same Subscriber select as the invoice query so payment-only subscribers
        // (invoice outside range) still carry phone/area/plan/wallet on their row.
        include: {
          Subscriber: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              balance: true,
              areaId: true,
              Area: { select: { name: true } },
              Plan: { select: { name: true } },
            },
          },
        },
        take: MAX_ROWS,
      }),
    ]);

    type Agg = {
      id: string;
      code: string;
      name: string;
      phone: string;
      area: string;
      plan: string;
      areaId: string;
      walletBalance: number;
      invoiceCount: number;
      totalBilled: number;
      totalCollected: number;
      lastPaymentAt: Date | null;
    };
    const bySubscriber = new Map<string, Agg>();
    const ensure = (id: string, seed?: Partial<Agg>): Agg => {
      let a = bySubscriber.get(id);
      if (!a) {
        a = {
          id,
          code: "",
          name: "",
          phone: "",
          area: "",
          plan: "",
          areaId: "",
          walletBalance: 0,
          invoiceCount: 0,
          totalBilled: 0,
          totalCollected: 0,
          lastPaymentAt: null,
          ...seed,
        };
        bySubscriber.set(id, a);
      }
      return a;
    };

    for (const inv of invoices) {
      const s = inv.Subscriber;
      const a = ensure(inv.subscriberId, {
        code: s?.code ?? "",
        name: s?.name ?? "",
        phone: s?.phone ?? "",
        area: s?.Area?.name ?? "",
        plan: s?.Plan?.name ?? "",
        areaId: s?.areaId ?? "",
        walletBalance: round2(num(s?.balance)),
      });
      a.invoiceCount += 1;
      a.totalBilled += num(inv.grandTotal);
    }
    for (const pay of payments) {
      if (pay.status !== "VERIFIED") continue; // collected = VERIFIED only
      const s = pay.Subscriber;
      const a = ensure(pay.subscriberId, {
        code: s?.code ?? "",
        name: s?.name ?? "",
        phone: s?.phone ?? "",
        area: s?.Area?.name ?? "",
        plan: s?.Plan?.name ?? "",
        areaId: s?.areaId ?? "",
        walletBalance: round2(num(s?.balance)),
      });
      a.totalCollected += num(pay.amount);
      const at = new Date(pay.createdAt);
      if (!a.lastPaymentAt || at > a.lastPaymentAt) a.lastPaymentAt = at;
    }

    // Register-mode filters: areaId (via Subscriber.areaId), q (code/name contains)
    const rows = Array.from(bySubscriber.values())
      .filter((a) => (areaId ? a.areaId === areaId : true))
      .filter((a) =>
        q ? a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) : true
      )
      .map((a) => ({
        subscriberId: a.id,
        subscriberCode: a.code,
        name: a.name,
        phone: a.phone,
        area: a.area,
        plan: a.plan,
        invoiceCount: a.invoiceCount,
        totalBilled: round2(a.totalBilled),
        totalCollected: round2(a.totalCollected),
        totalOutstanding: Math.max(0, round2(a.totalBilled - a.totalCollected)),
        walletBalance: a.walletBalance,
        lastPaymentAt: a.lastPaymentAt ? a.lastPaymentAt.toISOString() : null,
      }))
      .sort((x, y) => y.totalOutstanding - x.totalOutstanding)
      .slice(0, MAX_ROWS);

    const summary = {
      from: ymd(from),
      to: ymd(to),
      subscriberCount: rows.length,
      totalBilled: round2(rows.reduce((s, r) => s + r.totalBilled, 0)),
      totalCollected: round2(rows.reduce((s, r) => s + r.totalCollected, 0)),
      totalOutstanding: round2(rows.reduce((s, r) => s + r.totalOutstanding, 0)),
    };

    // CSV / XLSX export branch (register view)
    if (format === "csv" || format === "xlsx") {
      const headers = [
        "Subscriber Code",
        "Name",
        "Phone",
        "Area",
        "Plan",
        "Invoices",
        "Billed",
        "Collected",
        "Outstanding",
        "Wallet Balance",
        "Last Payment",
      ];
      const exportRows: (string | number)[][] = rows.map((r) => [
        r.subscriberCode,
        r.name,
        r.phone,
        r.area,
        r.plan,
        r.invoiceCount,
        r.totalBilled,
        r.totalCollected,
        r.totalOutstanding,
        r.walletBalance,
        r.lastPaymentAt ? ymd(new Date(r.lastPaymentAt)) : "",
      ]);
      await auditExport(request, "Statement", format, exportRows.length);
      const filename = generateExportFilename("statement-of-account", format);
      return format === "xlsx"
        ? xlsxResponse(headers, exportRows, filename)
        : csvResponse(headers, exportRows, filename);
    }

    return NextResponse.json({
      success: true,
      data: { summary, rows },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("statement-of-account report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build statement of account" },
      { status: 500 }
    );
  }
}
