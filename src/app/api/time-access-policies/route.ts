import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── GET: Fetch time access policies and subscriber assignments ─────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list-policies";
    const subscriberId = searchParams.get("subscriberId") || "";

    switch (action) {
      // ── list-policies: Return all time access policies ────────────────────
      case "list-policies": {
        const policies = await db.timeAccessPolicy.findMany({
          include: {
            SubscriberTimeAccess: {
              include: {
                Subscriber: {
                  select: { id: true, code: true, name: true, phone: true },
                },
              },
              orderBy: { priority: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        const transformed = policies.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          daysOfWeek: JSON.parse(p.daysOfWeek),
          startTime: p.startTime,
          endTime: p.endTime,
          action: p.action,
          speedDownKbps: p.speedDownKbps,
          speedUpKbps: p.speedUpKbps,
          enabled: p.enabled,
          subscriberCount: p.SubscriberTimeAccess.length,
          subscribers: p.SubscriberTimeAccess.map((s) => ({
            id: s.id,
            subscriberId: s.subscriberId,
            subscriberCode: s.Subscriber.code,
            subscriberName: s.Subscriber.name,
            priority: s.priority,
            enabled: s.enabled,
          })),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }));

        return NextResponse.json({ success: true, data: transformed });
      }

      // ── subscriber: Get all policies assigned to a subscriber ────────────
      case "subscriber": {
        if (!subscriberId) {
          return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
        }
        const assignments = await db.subscriberTimeAccess.findMany({
          where: { subscriberId },
          include: {
            TimeAccessPolicy: true,
            Subscriber: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { priority: "desc" },
        });

        const transformed = assignments.map((a) => ({
          id: a.id,
          subscriberId: a.subscriberId,
          subscriberCode: a.Subscriber.code,
          subscriberName: a.Subscriber.name,
          timeAccessPolicyId: a.timeAccessPolicyId,
          policyName: a.TimeAccessPolicy.name,
          policyDescription: a.TimeAccessPolicy.description,
          daysOfWeek: JSON.parse(a.TimeAccessPolicy.daysOfWeek),
          startTime: a.TimeAccessPolicy.startTime,
          endTime: a.TimeAccessPolicy.endTime,
          action: a.TimeAccessPolicy.action,
          speedDownKbps: a.TimeAccessPolicy.speedDownKbps,
          speedUpKbps: a.TimeAccessPolicy.speedUpKbps,
          policyEnabled: a.TimeAccessPolicy.enabled,
          assignmentEnabled: a.enabled,
          priority: a.priority,
          createdAt: a.createdAt.toISOString(),
        }));

        return NextResponse.json({ success: true, data: transformed });
      }

      // ── check: Check if a subscriber currently has active access ──────────
      case "check": {
        if (!subscriberId) {
          return NextResponse.json({ error: "subscriberId is required" }, { status: 400 });
        }

        const assignments = await db.subscriberTimeAccess.findMany({
          where: {
            subscriberId,
            enabled: true,
            TimeAccessPolicy: { enabled: true },
          },
          include: {
            TimeAccessPolicy: true,
          },
          orderBy: { priority: "desc" },
        });

        const now = new Date();
        const currentDay = now.getDay(); // 0=Sun .. 6=Sat
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        let effectiveAction: string | null = null;
        let effectiveSpeedDown = 0;
        let effectiveSpeedUp = 0;
        let matchedPolicy: string | null = null;

        for (const assignment of assignments) {
          const policy = assignment.TimeAccessPolicy;
          const days: number[] = JSON.parse(policy.daysOfWeek);

          if (!days.includes(currentDay)) continue;

          // Check time range (handles overnight: startTime > endTime)
          if (policy.startTime <= policy.endTime) {
            if (currentTime < policy.startTime || currentTime > policy.endTime) continue;
          } else {
            // Overnight schedule (e.g., 22:00 - 06:00)
            if (currentTime < policy.startTime && currentTime > policy.endTime) continue;
          }

          // This policy matches — highest priority wins (already sorted desc)
          effectiveAction = policy.action;
          effectiveSpeedDown = policy.speedDownKbps;
          effectiveSpeedUp = policy.speedUpKbps;
          matchedPolicy = policy.name;
          break;
        }

        // Default: ALLOW if no policy matches
        if (!effectiveAction) {
          effectiveAction = "ALLOW";
        }

        return NextResponse.json({
          success: true,
          data: {
            subscriberId,
            allowed: effectiveAction === "ALLOW" || effectiveAction === "RATE_LIMIT",
            action: effectiveAction,
            speedDownKbps: effectiveSpeedDown,
            speedUpKbps: effectiveSpeedUp,
            matchedPolicy,
            checkedAt: now.toISOString(),
            totalPolicies: assignments.length,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Time access policies GET error:", error);
    return NextResponse.json({ error: "Failed to fetch time access policies" }, { status: 500 });
  }
}

// ─── POST: Create / update / delete policies and assignments ────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── create-policy: Create a new time access policy ────────────────────
      case "create-policy": {
        const { name, description, daysOfWeek, startTime, endTime, policyAction: explicitPolicyAction, speedDownKbps, speedUpKbps, enabled } = body;
        const policyAction = explicitPolicyAction || 'ALLOW';

        if (!name) {
          return NextResponse.json({ error: "Policy name is required" }, { status: 400 });
        }

        // Check uniqueness
        const existing = await db.timeAccessPolicy.findUnique({ where: { name } });
        if (existing) {
          return NextResponse.json({ error: "Policy with this name already exists" }, { status: 409 });
        }

        const policy = await db.timeAccessPolicy.create({
          data: {
            name,
            description: description || "",
            daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : "[1,2,3,4,5,6,0]",
            startTime: startTime || "00:00",
            endTime: endTime || "23:59",
            action: policyAction,
            speedDownKbps: speedDownKbps || 0,
            speedUpKbps: speedUpKbps || 0,
            enabled: enabled !== undefined ? enabled : true,
          },
        });

        return NextResponse.json({ success: true, data: policy });
      }

      // ── update-policy: Update an existing time access policy ──────────────
      case "update-policy": {
        const { id, name, description, daysOfWeek, startTime, endTime, policyAction: explicitPolicyAction, speedDownKbps, speedUpKbps, enabled } = body;
        const policyAction = explicitPolicyAction;

        if (!id) {
          return NextResponse.json({ error: "Policy ID is required" }, { status: 400 });
        }

        const current = await db.timeAccessPolicy.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Policy not found" }, { status: 404 });
        }

        // If name is changing, check uniqueness
        if (name && name !== current.name) {
          const nameConflict = await db.timeAccessPolicy.findUnique({ where: { name } });
          if (nameConflict) {
            return NextResponse.json({ error: "Policy with this name already exists" }, { status: 409 });
          }
        }

        const updated = await db.timeAccessPolicy.update({
          where: { id },
          data: {
            name: name !== undefined ? name : current.name,
            description: description !== undefined ? description : current.description,
            daysOfWeek: daysOfWeek !== undefined ? JSON.stringify(daysOfWeek) : current.daysOfWeek,
            startTime: startTime !== undefined ? startTime : current.startTime,
            endTime: endTime !== undefined ? endTime : current.endTime,
            action: policyAction !== undefined ? policyAction : current.action,
            speedDownKbps: speedDownKbps !== undefined ? speedDownKbps : current.speedDownKbps,
            speedUpKbps: speedUpKbps !== undefined ? speedUpKbps : current.speedUpKbps,
            enabled: enabled !== undefined ? enabled : current.enabled,
          },
        });

        return NextResponse.json({ success: true, data: updated });
      }

      // ── delete-policy: Delete a time access policy ────────────────────────
      case "delete-policy": {
        const { id } = body;

        if (!id) {
          return NextResponse.json({ error: "Policy ID is required" }, { status: 400 });
        }

        const current = await db.timeAccessPolicy.findUnique({ where: { id } });
        if (!current) {
          return NextResponse.json({ error: "Policy not found" }, { status: 404 });
        }

        await db.timeAccessPolicy.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Policy deleted successfully" });
      }

      // ── assign: Assign a time access policy to a subscriber ───────────────
      case "assign": {
        const { subscriberId, timeAccessPolicyId, priority, enabled } = body;

        if (!subscriberId || !timeAccessPolicyId) {
          return NextResponse.json({ error: "subscriberId and timeAccessPolicyId are required" }, { status: 400 });
        }

        // Validate subscriber exists
        const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
        if (!subscriber) {
          return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
        }

        // Validate policy exists
        const policy = await db.timeAccessPolicy.findUnique({ where: { id: timeAccessPolicyId } });
        if (!policy) {
          return NextResponse.json({ error: "Time access policy not found" }, { status: 404 });
        }

        // Check for existing assignment
        const existing = await db.subscriberTimeAccess.findUnique({
          where: {
            subscriberId_timeAccessPolicyId: { subscriberId, timeAccessPolicyId },
          },
        });

        if (existing) {
          return NextResponse.json({ error: "Policy is already assigned to this subscriber" }, { status: 409 });
        }

        const assignment = await db.subscriberTimeAccess.create({
          data: {
            subscriberId,
            timeAccessPolicyId,
            priority: priority || 0,
            enabled: enabled !== undefined ? enabled : true,
          },
        });

        return NextResponse.json({ success: true, data: assignment });
      }

      // ── unassign: Remove a time access policy from a subscriber ───────────
      case "unassign": {
        const { subscriberId, timeAccessPolicyId } = body;

        if (!subscriberId || !timeAccessPolicyId) {
          return NextResponse.json({ error: "subscriberId and timeAccessPolicyId are required" }, { status: 400 });
        }

        const existing = await db.subscriberTimeAccess.findUnique({
          where: {
            subscriberId_timeAccessPolicyId: { subscriberId, timeAccessPolicyId },
          },
        });

        if (!existing) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        await db.subscriberTimeAccess.delete({
          where: {
            subscriberId_timeAccessPolicyId: { subscriberId, timeAccessPolicyId },
          },
        });

        return NextResponse.json({ success: true, message: "Policy unassigned from subscriber" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Time access policies POST error:", error);
    return NextResponse.json({ error: "Failed to process time access policy request" }, { status: 500 });
  }
}
