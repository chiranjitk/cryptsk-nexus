import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all technicians
    const technicians = await db.technician.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        skills: true,
        status: true,
        areasManaged: { select: { id: true, name: true } },
      },
    });

    // Fetch all unresolved complaints (OPEN, IN_PROGRESS, ASSIGNED, REOPENED)
    const unresolvedComplaints = await db.complaint.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "ASSIGNED", "REOPENED"] },
      },
      select: {
        id: true,
        ticketNumber: true,
        type: true,
        priority: true,
        description: true,
        assignedToId: true,
        createdAt: true,
        areaId: true,
        areasManaged: { select: { id: true, name: true } },
        Subscriber: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Determine which technicians are on leave today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const todayLeaves = await db.leaveRecord.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
      },
      select: { technicianId: true },
    });
    const onLeaveToday = new Set(todayLeaves.map((l) => l.technicianId));

    // Count open tickets per technician
    const openTicketsByTech = new Map<string, number>();
    for (const c of unresolvedComplaints) {
      if (c.assignedToId) {
        openTicketsByTech.set(c.assignedToId, (openTicketsByTech.get(c.assignedToId) || 0) + 1);
      }
    }

    // Filter available technicians (status = "available" and not on leave today)
    const availableTechnicians = technicians.filter(
      (t) => t.status === "available" && !onLeaveToday.has(t.id)
    );

    // Build dispatch recommendations
    const recommendations = unresolvedComplaints.map((complaint) => {
      const daysOpen = Math.max(0, Math.floor((now.getTime() - complaint.createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const complaintAreaId = complaint.areaId;

      const priorityPoints: Record<string, number> = {
        P1_CRITICAL: 20,
        P2_HIGH: 15,
        P3_MEDIUM: 10,
        P4_LOW: 5,
      };

      const scoredTechnicians = availableTechnicians.map((tech) => {
        let score = 0;
        const reasons: string[] = [];

        // Skill match (+20 points)
        const techSkills: string[] = Array.isArray(tech.skills)
          ? tech.skills
          : typeof tech.skills === "string"
            ? (() => { try { const parsed = JSON.parse(tech.skills); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
            : [];

        const complaintSkillMap: Record<string, string[]> = {
          NO_INTERNET: ["Fiber Splicing", "Network Debugging", "Router Config"],
          SLOW_SPEED: ["Router Config", "Network Debugging", "WiFi Setup"],
          CABLE_CUT: ["Fiber Splicing", "Cable Laying"],
          WIFI_ISSUE: ["WiFi Setup", "Router Config"],
          PLAN_CHANGE: ["Customer Service"],
          BILLING_QUERY: ["Customer Service"],
          VOIP_ISSUE: ["Router Config", "Network Debugging"],
          IPTV_ISSUE: ["Router Config", "ONT Setup"],
          NEW_CONNECTION: ["Fiber Splicing", "Cable Laying", "ONT Setup"],
          OTHER: [],
        };

        const relevantSkills = complaintSkillMap[complaint.type] || [];
        const matchingSkills = techSkills.filter((s) => relevantSkills.includes(s));
        if (matchingSkills.length > 0) {
          score += 20;
          reasons.push(`Skill match: ${matchingSkills.join(", ")}`);
        }

        // Same area (+30 points)
        const techAreaIds = new Set(tech.areasManaged.map((a) => a.id));
        if (complaintAreaId && techAreaIds.has(complaintAreaId)) {
          score += 30;
          reasons.push(`Covers area: ${complaint.Area?.name || "Unknown"}`);
        }

        // Workload balance (+20 points): fewer open tickets = higher score
        const openTickets = openTicketsByTech.get(tech.id) || 0;
        if (openTickets === 0) {
          score += 20;
          reasons.push("No open tickets");
        } else if (openTickets <= 3) {
          score += 15;
          reasons.push(`Low workload (${openTickets} open)`);
        } else if (openTickets <= 6) {
          score += 8;
          reasons.push(`Moderate workload (${openTickets} open)`);
        }

        // SLA urgency: higher priority = more points
        const slaPoints = priorityPoints[complaint.priority] || 5;
        score += slaPoints;
        if (complaint.priority === "P1_CRITICAL") {
          reasons.push("Critical priority escalation");
        }

        return {
          technicianId: tech.id,
          technicianName: tech.name,
          technicianPhone: tech.phone,
          matchScore: score,
          reasons,
        };
      });

      // Sort by match score descending
      scoredTechnicians.sort((a, b) => b.matchScore - a.matchScore);

      const recommended = scoredTechnicians[0] || null;

      return {
        Complaint: {
          id: complaint.id,
          ticketNumber: complaint.ticketNumber,
          type: complaint.type,
          priority: complaint.priority,
          description: complaint.description,
          subscriberName: complaint.Subscriber?.name || "Walk-in",
          subscriberPhone: complaint.Subscriber?.phone || "",
          areaName: complaint.Area?.name || "Unassigned",
          areaId: complaint.areaId,
          assignedToId: complaint.assignedToId,
          daysOpen,
          createdAt: complaint.createdAt,
        },
        recommendedTechnician: recommended
          ? {
              technicianId: recommended.technicianId,
              name: recommended.technicianName,
              phone: recommended.technicianPhone,
            }
          : null,
        matchScore: recommended?.matchScore || 0,
        reasons: recommended?.reasons || [],
        allCandidates: scoredTechnicians.slice(0, 3),
      };
    });

    // Sort recommendations by match score (most urgent/important first)
    recommendations.sort((a, b) => {
      // First sort by priority
      const priorityOrder: Record<string, number> = { P1_CRITICAL: 0, P2_HIGH: 1, P3_MEDIUM: 2, P4_LOW: 3 };
      const pDiff = (priorityOrder[a.Complaint.priority] || 9) - (priorityOrder[b.Complaint.priority] || 9);
      if (pDiff !== 0) return pDiff;
      // Then by days open (oldest first)
      return b.Complaint.daysOpen - a.Complaint.daysOpen;
    });

    return NextResponse.json({
      success: true,
      recommendations,
      availableTechniciansCount: availableTechnicians.length,
      totalUnresolved: unresolvedComplaints.length,
      onLeaveTodayCount: onLeaveToday.size,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[Technician Dispatch API]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dispatch queue" },
      { status: 500 }
    );
  }
}
