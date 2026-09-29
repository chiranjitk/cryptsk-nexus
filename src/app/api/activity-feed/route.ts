import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
  metadata?: Record<string, string>;
  // Raw fields for advanced consumers (e.g., activity-feed-widget)
  action?: string;
  entity?: string;
  entityId?: string;
}

// ─── Action → Type Mapping ─────────────────────────────────────

function mapActionToType(action: string, entity: string): string {
  const actionUpper = action.toUpperCase();
  const entityLower = entity.toLowerCase();

  // LOGIN actions
  if (actionUpper === "LOGIN" || actionUpper === "LOGIN_FAILED") {
    return "user_login";
  }

  // Map action + entity to type
  const map: Record<string, Record<string, string>> = {
    CREATE: {
      subscriber: "subscriber_created",
      payment: "payment_collected",
      complaint: "complaint_raised",
      invoice: "invoice_generated",
      installation: "installation_completed",
      plan: "plan_changed",
      lead: "subscriber_created",
      incident: "device_alert",
      maintenancewindow: "installation_completed",
    },
    UPDATE: {
      subscriber: "subscriber_created",
      payment: "payment_collected",
      complaint: "complaint_resolved",
      invoice: "invoice_generated",
      plan: "plan_changed",
      device: "device_alert",
      networkdevice: "device_alert",
    },
    DELETE: {
      subscriber: "device_alert",
      payment: "device_alert",
      complaint: "complaint_resolved",
      invoice: "device_alert",
    },
    STATUS_CHANGE: {
      subscriber: "subscriber_created",
      payment: "payment_collected",
      complaint: "complaint_resolved",
      incident: "device_alert",
    },
    PAYMENT: {
      payment: "payment_collected",
      invoice: "payment_collected",
    },
    INVOICE_GENERATE: {
      invoice: "invoice_generated",
    },
    INVOICE_PAID: {
      invoice: "invoice_generated",
    },
    VERIFICATION: {
      payment: "payment_collected",
    },
    REJECTION: {
      payment: "device_alert",
    },
    ASSIGN: {
      complaint: "complaint_raised",
      installation: "installation_completed",
    },
    CONFIG_CHANGE: {
      multiwan: "device_alert",
      radius: "device_alert",
      radiusgroup: "device_alert",
    },
  };

  // Try to find in the mapping
  const entityMap = map[actionUpper];
  if (entityMap) {
    for (const [key, value] of Object.entries(entityMap)) {
      if (entityLower.includes(key)) return value;
    }
  }

  // Fallback: derive from action
  if (actionUpper.startsWith("BULK_")) return "device_alert";
  if (actionUpper === "LOGOUT") return "user_login";
  if (actionUpper === "PASSWORD_CHANGE") return "user_login";
  if (actionUpper === "EXPORT") return "invoice_generated";
  if (actionUpper === "BACKUP" || actionUpper === "RESTORE") return "device_alert";

  return "subscriber_created"; // default
}

// ─── Title/Description Generator ───────────────────────────────

function generateTitleAndDescription(
  action: string,
  entity: string,
  details: Record<string, unknown>
): { title: string; description: string } {
  const actionUpper = action.toUpperCase();
  const entityDisplay = entity.charAt(0).toUpperCase() + entity.slice(1);

  // Extract name from details
  const name = (details.name as string) || (details.title as string) || (details.email as string) || "";

  switch (actionUpper) {
    case "CREATE":
      return {
        title: `New ${entityDisplay}`,
        description: name ? `Created ${entityDisplay.toLowerCase()} "${name}"` : `Created new ${entityDisplay.toLowerCase()}`,
      };
    case "UPDATE":
      return {
        title: `${entityDisplay} updated`,
        description: name ? `Updated ${entityDisplay.toLowerCase()} "${name}"` : `Updated ${entityDisplay.toLowerCase()}`,
      };
    case "DELETE":
      return {
        title: `${entityDisplay} deleted`,
        description: name ? `Deleted ${entityDisplay.toLowerCase()} "${name}"` : `Deleted ${entityDisplay.toLowerCase()}`,
      };
    case "LOGIN":
      return {
        title: "User logged in",
        description: (details.email as string) ? `Login by ${(details.email as string)}` : "Successful login",
      };
    case "LOGIN_FAILED":
      return {
        title: "Login failed",
        description: (details.email as string) ? `Failed login attempt for ${(details.email as string)}` : "Failed login attempt",
      };
    case "LOGOUT":
      return { title: "User logged out", description: "Session ended" };
    case "PASSWORD_CHANGE":
      return { title: "Password changed", description: "User password was updated" };
    case "STATUS_CHANGE": {
      const from = (details.from as string) || "";
      const to = (details.to as string) || "";
      return {
        title: `${entityDisplay} status changed`,
        description: name
          ? `${entityDisplay} "${name}" changed from ${from} to ${to}`
          : `Changed from ${from} to ${to}`,
      };
    }
    case "PAYMENT":
      return {
        title: "Payment recorded",
        description: name ? `Payment for ${name}` : "Payment recorded",
      };
    case "INVOICE_GENERATE":
      return {
        title: "Invoice generated",
        description: name ? `Invoice generated for ${name}` : "Invoice generated",
      };
    case "INVOICE_PAID":
      return {
        title: "Invoice paid",
        description: name ? `Invoice paid by ${name}` : "Invoice marked as paid",
      };
    case "VERIFICATION":
      return {
        title: "Payment verified",
        description: name ? `Verified payment for ${name}` : "Payment verified",
      };
    case "REJECTION":
      return {
        title: "Payment rejected",
        description: name ? `Rejected payment for ${name}` : "Payment rejected",
      };
    case "ASSIGN":
      return {
        title: `${entityDisplay} assigned`,
        description: name ? `Assigned ${entityDisplay.toLowerCase()} to ${name}` : `Assigned ${entityDisplay.toLowerCase()}`,
      };
    case "EXPORT":
      return {
        title: `Export ${entityDisplay}`,
        description: `Exported ${(details.recordCount as number) || ""} ${entityDisplay.toLowerCase()} records as ${(details.format as string) || "file"}`,
      };
    case "CONFIG_CHANGE":
      return {
        title: "Configuration updated",
        description: `Updated ${entityDisplay} configuration`,
      };
    case "BACKUP":
      return { title: "Backup created", description: "System backup completed" };
    case "RESTORE":
      return { title: "System restored", description: "Restored from backup" };
    default:
      return {
        title: `${action} ${entityDisplay}`,
        description: name ? `${action} on ${entityDisplay.toLowerCase()} "${name}"` : `${action} on ${entityDisplay.toLowerCase()}`,
      };
  }
}

// ─── Metadata Extraction ───────────────────────────────────────

function extractMetadata(
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown>
): Record<string, string> {
  const meta: Record<string, string> = { entity, entityId };

  // Entity-specific metadata
  if (entity.toLowerCase() === "subscriber") {
    if (details.phone) meta.phone = String(details.phone);
    if (details.email) meta.email = String(details.email);
    if (details.status) meta.status = String(details.status);
    if (details.planId) meta.planId = String(details.planId);
  } else if (entity.toLowerCase() === "payment") {
    if (details.amount) meta.amount = String(details.amount);
    if (details.paymentMode) meta.mode = String(details.paymentMode);
    if (details.receiptNumber) meta.receiptNumber = String(details.receiptNumber);
    if (details.status) meta.status = String(details.status);
  } else if (entity.toLowerCase() === "complaint") {
    if (details.ticketNumber) meta.ticketNumber = String(details.ticketNumber);
    if (details.type) meta.type = String(details.type);
    if (details.priority) meta.priority = String(details.priority);
    if (details.status) meta.status = String(details.status);
  } else if (entity.toLowerCase() === "invoice") {
    if (details.invoiceNumber) meta.invoiceNumber = String(details.invoiceNumber);
    if (details.grandTotal) meta.amount = String(details.grandTotal);
    if (details.totalAmount) meta.amount = String(details.totalAmount);
    if (details.status) meta.status = String(details.status);
  } else if (entity.toLowerCase() === "plan") {
    if (details.name) meta.planName = String(details.name);
    if (details.priceMonthly) meta.price = String(details.priceMonthly);
    if (details.status) meta.status = String(details.status);
  } else if (entity.toLowerCase() === "incident") {
    if (details.title) meta.title = String(details.title);
    if (details.severity) meta.severity = String(details.severity);
    if (details.status) meta.status = String(details.status);
  }

  return meta;
}

// ─── GET Handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const maxItems = Math.min(parseInt(searchParams.get("maxItems") || "15"), 50);

    // Query the 15 most recent audit log entries from the AuditLog model
    const logs = await db.auditLog.findMany({
      take: maxItems,
      orderBy: { timestamp: "desc" },
      where: { isArchived: false },
      include: {
        User: {
          select: { name: true, email: true },
        },
      },
    });

    // Transform AuditLog entries into ActivityItem format
    const items: ActivityItem[] = logs.map((log) => {
      // Safely parse the details JSON string
      let details: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(log.details);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          details = parsed as Record<string, unknown>;
        }
      } catch {
        // If details is not valid JSON, use empty object
      }

      const { title, description } = generateTitleAndDescription(
        log.action,
        log.entity,
        details
      );

      const type = mapActionToType(log.action, log.entity);
      const metadata = extractMetadata(log.action, log.entity, log.entityId, details);

      return {
        id: log.id,
        type,
        title,
        description,
        timestamp: log.timestamp.toISOString(),
        actorName: log.userName !== "System" ? log.userName : undefined,
        metadata,
        // Raw fields for advanced consumers
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
      };
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "message" in error
    ) {
      return NextResponse.json(
        { success: false, error: (error as { message: string }).message },
        { status: (error as { statusCode: number }).statusCode }
      );
    }
    console.error("Activity feed error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch activity feed" },
      { status: 500 }
    );
  }
}
