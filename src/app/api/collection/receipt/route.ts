import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = req.nextUrl;
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, address: true, Area: { select: { name: true } } } },
        Invoice: { select: { id: true, invoiceNumber: true } },
        User_Payment_collectedByIdToUser: { select: { id: true, name: true } },
        User_Payment_verifiedByIdToUser: { select: { id: true, name: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const isp = await db.ispSettings.findUnique({ where: { id: "default" } });

    return NextResponse.json({
      payment,
      isp: {
        companyName: isp?.companyName || "My ISP",
        address: isp?.address || "",
        city: isp?.city || "",
        state: isp?.state || "",
        pincode: isp?.pincode || "",
        phone: isp?.phone || "",
        email: isp?.email || "",
        gstin: isp?.gstin || "",
        website: isp?.website || "",
        receiptFooterText: isp?.receiptFooterText || "Thank you for choosing us!",
      },
    });
  } catch (error) {
    console.error("Receipt GET error:", error);
    return NextResponse.json({ error: "Failed to fetch receipt data" }, { status: 500 });
  }
}
