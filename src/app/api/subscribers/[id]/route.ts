import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fireEventAsync } from "@/lib/services/webhook-service";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, requirePermission, AuthError } from "@/lib/api-auth";
import { removeUserFromFreeRADIUS, updateUserFreeRADIUSGroup, updateUserPasswordInFreeRADIUS, syncUserToFreeRADIUS, blockUserInFreeRADIUS, unblockUserInFreeRADIUS } from "@/lib/radius-sync";

// GET /api/subscribers/[id] — single subscriber with relations
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req); // [AUDIT-FIX F-07] detail view leaked PII + invoices + payments unauthenticated
    const { id } = await params;
    const subscriber = await db.subscriber.findUnique({
      where: { id },
      include: {
        Area: { select: { id: true, name: true } },
        Plan: {
          select: {
            id: true, name: true, priceMonthly: true, downloadSpeed: true, uploadSpeed: true,
            RadiusGroup: { select: { id: true, name: true } },
          },
        },
        RadiusGroup: { select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
        RadiusUser: { select: { id: true, createdAt: true } },
        NetworkDevice: { select: { id: true, name: true, type: true, ipAddress: true, status: true } },
        Invoice: { orderBy: { createdAt: "desc" }, take: 10 },
        Payment: { orderBy: { createdAt: "desc" }, take: 10 },
        Complaint: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // [AUDIT-FIX F-22] Strip credential/KYC fields from every layer of the response.
    // The service password is required by RADIUS internally but must never leave the server;
    // KYC identifiers ride along on the base model and were previously serialized wholesale.
    const { servicePassword: _sp, kycAadhaarNumber: _ky, panNumber: _pan, ...safeBase } = subscriber;
    const strip = <T extends Record<string, unknown>>(row: T | undefined | null): Record<string, unknown> | null => {
      if (!row) return null;
      const { servicePassword: _a, kycAadhaarNumber: _b, panNumber: _c, ...rest } = row;
      return rest as Record<string, unknown>;
    };

    // Map Prisma PascalCase relations to the camelCase keys the frontend expects.
    // Original PascalCase keys are kept (additive) so existing consumers are unaffected.
    const detail = {
      ...safeBase,
      area: subscriber.Area ?? null,
      plan: subscriber.Plan ?? null,
      radiusGroup: subscriber.RadiusGroup ?? null,
      radiusUser: subscriber.RadiusUser ?? null,
      assignedDevice: subscriber.NetworkDevice ?? null,
      radiusGroupName: subscriber.RadiusGroup?.name ?? null,
      invoices: (subscriber.Invoice ?? []).map(strip),
      payments: (subscriber.Payment ?? []).map(strip),
      complaints: subscriber.Complaint ?? [],
    };

    return NextResponse.json(detail);
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Subscriber GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscriber" }, { status: 500 });
  }
}

// PUT /api/subscribers/[id] — update subscriber
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();

    const subscriber = await db.subscriber.findUnique({
      where: { id },
      include: { RadiusUser: { select: { id: true } } },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Validate phone if provided
    if (body.phone) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(body.phone)) {
        return NextResponse.json({ error: "Invalid phone number. Must be 10 digits starting with 6-9" }, { status: 400 });
      }
    }

    // Validate email if provided
    if (body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
    }

    // Validate serviceUsername if being changed (format + uniqueness)
    const usernameChanged = body.serviceUsername !== undefined && body.serviceUsername !== subscriber.serviceUsername;
    if (usernameChanged) {
      const usernameRegex = /^[a-zA-Z0-9._-]+$/;
      if (!body.serviceUsername || !usernameRegex.test(body.serviceUsername.trim())) {
        return NextResponse.json({ error: "Invalid service username. Only alphanumeric characters, dots, dashes, and underscores are allowed." }, { status: 400 });
      }
      const existing = await db.subscriber.findUnique({ where: { serviceUsername: body.serviceUsername } });
      if (existing) {
        return NextResponse.json({ error: "Service username already exists" }, { status: 409 });
      }
    }

    // Validate radiusGroupId if provided
    if (body.radiusGroupId) {
      const group = await db.radiusGroup.findUnique({ where: { id: body.radiusGroupId } });
      if (!group) {
        return NextResponse.json({ error: "RADIUS group not found" }, { status: 404 });
      }
    }

    const updated = await db.subscriber.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.areaId !== undefined && { areaId: body.areaId || null }),
        ...(body.planId !== undefined && { planId: body.planId || null }),
        ...(body.connectionType !== undefined && { connectionType: body.connectionType }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.altPhone !== undefined && { altPhone: body.altPhone }),
        ...(body.landmark !== undefined && { landmark: body.landmark }),
        ...(body.pincode !== undefined && { pincode: body.pincode }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.internalNotes !== undefined && { internalNotes: body.internalNotes }),
        ...(body.macAddress !== undefined && { macAddress: body.macAddress }),
        ...(body.ipAddress !== undefined && { ipAddress: body.ipAddress }),
        ...(body.ipType !== undefined && { ipType: body.ipType }),
        ...(body.serviceUsername !== undefined && { serviceUsername: body.serviceUsername }),
        ...(body.servicePassword !== undefined && { servicePassword: body.servicePassword }),
        ...(body.assignedDeviceId !== undefined && { assignedDeviceId: body.assignedDeviceId || null }),
        ...(body.gstin !== undefined && { gstin: body.gstin }),
        ...(body.panNumber !== undefined && { panNumber: body.panNumber }),
        ...(body.kycAadhaarNumber !== undefined && { kycAadhaarNumber: body.kycAadhaarNumber }),
        ...(body.kycDocPath !== undefined && { kycDocPath: body.kycDocPath }),
        ...(body.profilePhotoPath !== undefined && { profilePhotoPath: body.profilePhotoPath }),
        ...(body.kycVerified !== undefined && { kycVerified: body.kycVerified }),
        ...(body.routerRented !== undefined && { routerRented: body.routerRented }),
        ...(body.routerSerial !== undefined && { routerSerial: body.routerSerial }),
        ...(body.routerDeposit !== undefined && { routerDeposit: body.routerDeposit ? parseFloat(String(body.routerDeposit)) : 0 }),
        ...(body.activationDate !== undefined && { activationDate: body.activationDate ? new Date(body.activationDate) : null }),
        ...(body.billingStartDate !== undefined && { billingStartDate: body.billingStartDate ? new Date(body.billingStartDate) : null }),
        ...(body.radiusGroupId !== undefined && { radiusGroupId: body.radiusGroupId || null }),
        ...(body.sessionTimeout !== undefined && { sessionTimeout: body.sessionTimeout || null }),
        ...(body.idleTimeout !== undefined && { idleTimeout: body.idleTimeout || null }),
        ...(body.radiusEnabled !== undefined && { radiusEnabled: body.radiusEnabled }),
        ...(body.ipStackType !== undefined && { ipStackType: body.ipStackType as any }),
        ...(body.ipv6Address !== undefined && { ipv6Address: body.ipv6Address }),
        ...(body.ipv6Prefix !== undefined && { ipv6Prefix: body.ipv6Prefix }),
        ...(body.ipv6PrefixLength !== undefined && { ipv6PrefixLength: parseInt(body.ipv6PrefixLength) || 64 }),
        ...(body.ipv6Duid !== undefined && { ipv6Duid: body.ipv6Duid }),
        ...(body.ipv6AssignmentMode !== undefined && { ipv6AssignmentMode: body.ipv6AssignmentMode }),
        ...(body.ipv6PoolId !== undefined && { ipv6PoolId: body.ipv6PoolId || null }),
        ...(body.currentSpeedDown !== undefined && { currentSpeedDown: body.currentSpeedDown || null }),
        ...(body.currentSpeedUp !== undefined && { currentSpeedUp: body.currentSpeedUp || null }),
        // loginRestriction / loginRestrictionValue: accepted but not persisted (no DB column)
        // These policy fields are handled by the session engine or future schema migration
        // ...(body.loginRestriction !== undefined && { loginRestriction: body.loginRestriction }),
      },
      include: {
        Area: { select: { id: true, name: true } },
        Plan: {
          select: {
            id: true, name: true, priceMonthly: true, downloadSpeed: true, uploadSpeed: true,
            RadiusGroup: { select: { id: true, name: true } },
          },
        },
        RadiusGroup: { select: { id: true, name: true } },
        RadiusUser: { select: { id: true, createdAt: true } },
      },
    });

    // Handle RADIUS provisioning: sync RadiusUser record with radiusEnabled
    if (body.radiusEnabled !== undefined) {
      if (body.radiusEnabled && !subscriber.RadiusUser) {
        // Enable: create thin RadiusUser record
        try {
          await db.radiusUser.create({ data: { subscriberId: id } });
        } catch (e) {
          console.error("[Subscriber] Failed to create RadiusUser record:", e);
        }
      } else if (!body.radiusEnabled && subscriber.RadiusUser) {
        // Disable: delete RadiusUser record + clean up FreeRADIUS
        try {
          await db.radiusUser.delete({ where: { subscriberId: id } });
          if (subscriber.serviceUsername) {
            await removeUserFromFreeRADIUS(subscriber.serviceUsername);
          }
        } catch (e) {
          console.error("[Subscriber] Failed to delete RadiusUser record:", e);
        }
      }
    }

    // Re-provision FreeRADIUS identity when serviceUsername changes.
    // The old radcheck/radreply/radusergroup rows keep the previous username,
    // so remove them and provision the new username with the effective
    // password + group — otherwise PPPoE auth breaks after a rename.
    if (usernameChanged && subscriber.radiusEnabled && subscriber.serviceUsername) {
      try {
        await removeUserFromFreeRADIUS(subscriber.serviceUsername);

        const effectiveRadiusGroupId = body.radiusGroupId !== undefined ? (body.radiusGroupId || null) : subscriber.radiusGroupId;
        const effectivePlanId = body.planId !== undefined ? (body.planId || null) : subscriber.planId;
        let groupName: string | null = null;
        let maxSessions = 1;
        let fallbackRateLimit: string | null = null;
        if (effectiveRadiusGroupId) {
          const rg = await db.radiusGroup.findUnique({ where: { id: effectiveRadiusGroupId }, select: { name: true } });
          groupName = rg?.name || null;
        }
        if (effectivePlanId) {
          const p = await db.plan.findUnique({ where: { id: effectivePlanId }, select: { groupId: true, maxConcurrentSessions: true, downloadSpeed: true, uploadSpeed: true } });
          if (p?.groupId && !groupName) {
            const rg = await db.radiusGroup.findUnique({ where: { id: p.groupId }, select: { name: true } });
            groupName = rg?.name || null;
          }
          if (p?.maxConcurrentSessions) maxSessions = p.maxConcurrentSessions;
          if (p?.downloadSpeed && p?.uploadSpeed) fallbackRateLimit = `${p.downloadSpeed}M/${p.uploadSpeed}M`;
        }
        const effectivePassword = (body.servicePassword !== undefined && body.servicePassword) ? body.servicePassword : subscriber.servicePassword;
        await syncUserToFreeRADIUS(body.serviceUsername.trim(), effectivePassword, groupName, maxSessions, fallbackRateLimit);
        console.log(`[Subscriber PUT] RADIUS identity re-synced: ${subscriber.serviceUsername} → ${body.serviceUsername.trim()}`);
      } catch (radiusErr) {
        console.error("[Subscriber PUT] RADIUS identity re-sync on username change failed:", radiusErr);
      }
    }

    // Sync RADIUS group when planId changes (plan's RadiusGroup → radusergroup)
    if (body.planId !== undefined && body.planId !== subscriber.planId) {
      if (subscriber.serviceUsername && subscriber.radiusEnabled) {
        try {
          let newGroupName: string | null = null;
          if (body.planId) {
            // Look up the new plan's associated RadiusGroup
            const newPlan = await db.plan.findUnique({
              where: { id: body.planId },
              select: { groupId: true },
            });
            if (newPlan?.groupId) {
              const rg = await db.radiusGroup.findUnique({ where: { id: newPlan.groupId }, select: { name: true } });
              newGroupName = rg?.name || null;
            }
          }
          await updateUserFreeRADIUSGroup(subscriber.serviceUsername, newGroupName);
        } catch (radiusErr) {
          console.error('[Subscriber PUT] RADIUS group sync on plan change failed:', radiusErr);
        }
      }
    }

    // Sync RADIUS group when radiusGroupId changes
    if (body.radiusGroupId !== undefined && body.radiusGroupId !== subscriber.radiusGroupId) {
      if (subscriber.serviceUsername && subscriber.radiusEnabled) {
        try {
          let newGroupName: string | null = null;
          if (body.radiusGroupId) {
            const newGroup = await db.radiusGroup.findUnique({ where: { id: body.radiusGroupId } });
            newGroupName = newGroup?.name || null;
          }
          await updateUserFreeRADIUSGroup(subscriber.serviceUsername, newGroupName);
        } catch (radiusErr) {
          console.error("[Subscriber PUT] RADIUS group sync failed:", radiusErr);
        }
      }
    }

    // Sync RADIUS password when servicePassword changes (identity unchanged)
    if (body.servicePassword !== undefined && body.servicePassword !== subscriber.servicePassword && !usernameChanged) {
      if (subscriber.serviceUsername && subscriber.radiusEnabled) {
        try {
          await updateUserPasswordInFreeRADIUS(subscriber.serviceUsername, body.servicePassword);
        } catch (radiusErr) {
          console.error("[Subscriber PUT] RADIUS password sync failed:", radiusErr);
        }
      }
    }

    // B12 FIX: Block RADIUS auth when subscriber is suspended/disconnected (Auth-Type=Reject)
    if (body.status !== undefined && body.status !== subscriber.status) {
      const blockingStatuses = ["SUSPENDED", "DISCONNECTED"];
      const restoringStatuses = ["ACTIVE", "TRIAL"];
      const newStatus = body.status as string;

      if (blockingStatuses.includes(newStatus) && subscriber.serviceUsername && subscriber.radiusEnabled) {
        try {
          await blockUserInFreeRADIUS(subscriber.serviceUsername);
          console.log(`[Subscriber PUT] RADIUS blocked (Auth-Type=Reject) for ${subscriber.serviceUsername} due to status=${newStatus}`);
        } catch (radiusErr) {
          console.error("[Subscriber PUT] Failed to block RADIUS on status change:", radiusErr);
        }
      } else if (restoringStatuses.includes(newStatus) && subscriber.serviceUsername && subscriber.radiusEnabled) {
        try {
          await unblockUserInFreeRADIUS(subscriber.serviceUsername);
          console.log(`[Subscriber PUT] RADIUS unblocked for ${subscriber.serviceUsername} due to status=${newStatus}`);
        } catch (radiusErr) {
          console.error("[Subscriber PUT] Failed to unblock RADIUS on status change:", radiusErr);
        }
      }
    }

    // Fire webhooks for plan changes and status changes
    if (body.planId && body.planId !== subscriber.planId) {
      fireEventAsync("plan.changed", {
        subscriberId: id,
        subscriberCode: subscriber.code,
        subscriberName: subscriber.name,
        oldPlanId: subscriber.planId,
        newPlanId: body.planId,
        newPlanName: updated.Plan?.name,
      });
    }
    if (body.status && body.status !== subscriber.status) {
      fireEventAsync("subscriber.status_changed", {
        subscriberId: id,
        subscriberCode: subscriber.code,
        subscriberName: subscriber.name,
        oldStatus: subscriber.status,
        newStatus: body.status,
      });
    }

    await auditUpdate(req, "Subscriber", id, body, subscriber, { userId });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Subscriber PUT error:", error);
    return NextResponse.json({ error: "Failed to update subscriber" }, { status: 500 });
  }
}

// DELETE /api/subscribers/[id] — delete subscriber
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // [AUDIT-FIX F-20] Destructive action — requires explicit subscribers.delete.
    const { userId } = await requirePermission(req, "subscribers.delete");
    const { id } = await params;
    const subscriber = await db.subscriber.findUnique({
      where: { id },
      include: { RadiusUser: { select: { id: true } } },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // ── [AUDIT-FIX F-17] Financial-history retention guards ──
    // ISPs are legally required to retain billing records (GST / income-tax);
    // hard-deleting a subscriber used to silently destroy Payments, Invoices
    // and Refunds. Deleting is now restricted to customers with NO financial
    // history — everyone else must be disconnected (SUSPENDED/DISCONNECTED)
    // and retained instead.
    if (subscriber.status === "ACTIVE") {
      return NextResponse.json(
        {
          error: "Cannot delete an ACTIVE subscriber. Disconnect the connection first (suspend or change status to DISCONNECTED), then delete.",
          code: "SUBSCRIBER_ACTIVE",
        },
        { status: 409 }
      );
    }

    const [paymentCount, invoiceCount, refundCount] = await Promise.all([
      db.payment.count({ where: { subscriberId: id } }),
      db.invoice.count({ where: { subscriberId: id } }),
      db.refund.count({ where: { Payment: { subscriberId: id } } }),
    ]);
    if (paymentCount > 0 || invoiceCount > 0 || refundCount > 0) {
      return NextResponse.json(
        {
          error: `Subscriber has financial history (${invoiceCount} invoice(s), ${paymentCount} payment(s), ${refundCount} refund(s)). Records must be retained for tax/GST compliance — use status DISCONNECTED instead of deleting.`,
          code: "FINANCIAL_HISTORY_EXISTS",
          counts: { invoices: invoiceCount, payments: paymentCount, refunds: refundCount },
        },
        { status: 409 }
      );
    }

    const deletedRecord = { ...subscriber };

    // Clean up FreeRADIUS entries (radcheck, radreply, radusergroup) for the subscriber
    // Always attempt cleanup when serviceUsername exists, regardless of radiusEnabled flag,
    // to prevent orphaned RADIUS records.
    if (subscriber.serviceUsername) {
      try {
        await removeUserFromFreeRADIUS(subscriber.serviceUsername);
      } catch (radiusErr) {
        console.error("[Subscriber DELETE] RADIUS cleanup failed:", radiusErr);
        // Don't block subscriber deletion on RADIUS failure
      }
    }

    // Delete all related records to avoid FK constraint errors.
    // [AUDIT-FIX F-18] All statements are parameterized ($1 bindings) — the
    // previous $executeRawUnsafe list interpolated the URL id directly; safe
    // today only because a findUnique pre-check happened to block injection.
    const sid = id;
    // Tables that reference Invoice (delete before Invoice)
    const childDeletes: Array<() => Promise<number>> = [
      () => db.$executeRawUnsafe(`DELETE FROM "GeneratedLegalNotice" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Payment" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "PaymentPlan" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "RecoveryEscalation" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "RecoverySla" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "TdsEntry" WHERE "subscriberId" = $1`, sid),
      // RadiusSession references RadiusUser (delete before RadiusUser)
      () => db.$executeRawUnsafe(
        `DELETE FROM "RadiusSession" WHERE "radiusUserId" IN (SELECT id FROM "RadiusUser" WHERE "subscriberId" = $1)`, sid
      ),
      // All other direct FK children of Subscriber
      () => db.$executeRawUnsafe(`DELETE FROM "CoaEvent" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Complaint" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "DataUsage" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Dispute" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "EnterpriseSession" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "EnterpriseUser" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Installation" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "IpMacHistory" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "IpsAlert" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "IpsBlockRule" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "LdapConfig" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "LoyaltyMember" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "NasSession" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Notification" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "PortalSession" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "ReferralCode" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "ReferralTracking" WHERE "refereeId" = $1 OR "referrerId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "SubscriberAddOn" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "SubscriberChargeOverride" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "SubscriberGracePeriod" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "SubscriberTimeAccess" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "SubscriberTopUp" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "UsageLog" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "UserActionHistory" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "UserBillingCycle" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "UserRadiusAttribute" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "Voucher" WHERE "usedBySubscriberId" = $1`, sid),
      // Invoice and RadiusUser last (other tables may reference them)
      () => db.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "RecurringInvoiceTemplate" WHERE "subscriberId" = $1`, sid),
      () => db.$executeRawUnsafe(`DELETE FROM "RadiusUser" WHERE "subscriberId" = $1`, sid),
    ];

    for (const exec of childDeletes) {
      try {
        await exec();
      } catch (e) {
        // Table may not exist or column may differ — log and continue
        console.error(`[Subscriber DELETE] Child cleanup failed:`, (e as Error).message);
      }
    }

    await db.subscriber.delete({ where: { id } });
    await auditDelete(req, "Subscriber", id, deletedRecord, { userId });
    return NextResponse.json({ message: "Subscriber deleted" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Subscriber DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete subscriber" }, { status: 500 });
  }
}
