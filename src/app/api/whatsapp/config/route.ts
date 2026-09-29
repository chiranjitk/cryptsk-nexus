import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET() {
  try {
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });

    if (!settings) {
      return NextResponse.json({
        apiToken: "",
        phoneNumberId: "",
        enabled: false,
        autoReplyEnabled: false,
        greetingMessage: "",
        awayMessage: "",
        businessName: "",
        businessCategory: "",
        businessAddress: "",
        businessEmail: "",
        businessPhone: "",
        businessWebsite: "",
        businessAbout: "",
      });
    }

    return NextResponse.json({
      apiToken: settings.whatsappApiToken,
      phoneNumberId: settings.whatsappPhoneNumberId,
      enabled: settings.whatsappEnabled,
      autoReplyEnabled: settings.whatsappAutoReply,
      greetingMessage: settings.whatsappGreetingMessage,
      awayMessage: settings.whatsappAwayMessage,
      businessName: settings.whatsappBusinessName,
      businessCategory: settings.whatsappBusinessCategory,
      businessAddress: settings.whatsappBusinessAddress,
      businessEmail: settings.whatsappBusinessEmail,
      businessPhone: settings.whatsappBusinessPhone,
      businessWebsite: settings.whatsappBusinessWebsite,
      businessAbout: settings.whatsappBusinessAbout,
    });
  } catch (error) {
    console.error("WhatsApp config error:", error);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const settings = await db.ispSettings.upsert({
      where: { id: "default" },
      update: {
        whatsappApiToken: body.apiToken ?? undefined,
        whatsappPhoneNumberId: body.phoneNumberId ?? undefined,
        whatsappEnabled: body.enabled !== undefined ? !!body.enabled : undefined,
        whatsappAutoReply: body.autoReplyEnabled !== undefined ? !!body.autoReplyEnabled : undefined,
        whatsappGreetingMessage: body.greetingMessage ?? undefined,
        whatsappAwayMessage: body.awayMessage ?? undefined,
        whatsappBusinessName: body.whatsappBusinessName ?? body.businessName ?? undefined,
        whatsappBusinessCategory: body.whatsappBusinessCategory ?? body.businessCategory ?? undefined,
        whatsappBusinessAddress: body.whatsappBusinessAddress ?? body.businessAddress ?? undefined,
        whatsappBusinessEmail: body.whatsappBusinessEmail ?? body.businessEmail ?? undefined,
        whatsappBusinessPhone: body.whatsappBusinessPhone ?? body.businessPhone ?? undefined,
        whatsappBusinessWebsite: body.whatsappBusinessWebsite ?? body.businessWebsite ?? undefined,
        whatsappBusinessAbout: body.whatsappBusinessAbout ?? body.businessAbout ?? undefined,
      },
      create: {
        id: "default",
        whatsappApiToken: body.apiToken || "",
        whatsappPhoneNumberId: body.phoneNumberId || "",
        whatsappEnabled: !!body.enabled,
        whatsappAutoReply: !!body.autoReplyEnabled,
        whatsappGreetingMessage: body.greetingMessage || "",
        whatsappAwayMessage: body.awayMessage || "",
        whatsappBusinessName: body.whatsappBusinessName || body.businessName || "",
        whatsappBusinessCategory: body.whatsappBusinessCategory || body.businessCategory || "",
        whatsappBusinessAddress: body.whatsappBusinessAddress || body.businessAddress || "",
        whatsappBusinessEmail: body.whatsappBusinessEmail || body.businessEmail || "",
        whatsappBusinessPhone: body.whatsappBusinessPhone || body.businessPhone || "",
        whatsappBusinessWebsite: body.whatsappBusinessWebsite || body.businessWebsite || "",
        whatsappBusinessAbout: body.whatsappBusinessAbout || body.businessAbout || "",
      },
    });

    await auditLog(request, "CONFIG_CHANGE", "WhatsAppConfig", "default", {
      details: {
        enabled: settings.whatsappEnabled,
        autoReply: settings.whatsappAutoReply,
        hasBusinessProfile: !!settings.whatsappBusinessName,
      },
      userId,
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp config save error:", error);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
