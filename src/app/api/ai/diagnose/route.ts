import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import ZAI from "z-ai-web-dev-sdk";

const DIAGNOSIS_SYSTEM_PROMPT = `You are an expert ISP network diagnostician for Cryptsk. Analyze subscriber network data and provide actionable troubleshooting steps. Be specific about the subscriber's situation. Use INR for currency. Focus on Indian FTTH/Wireless ISP scenarios.`;

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { subscriberId } = await request.json();

    if (!subscriberId || typeof subscriberId !== "string") {
      return NextResponse.json({ error: "Subscriber ID is required" }, { status: 400 });
    }

    // Look up subscriber by ID, phone, code, or PPPoE username
    const subscriber = await db.subscriber.findFirst({
      where: {
        OR: [
          { id: subscriberId },
          { phone: subscriberId },
          { code: subscriberId },
          { serviceUsername: subscriberId },
        ],
      },
      include: {
        Plan: true,
        Area: true,
        assignedDevice: {
          select: { name: true, ipAddress: true, status: true, type: true, cpuUsage: true, memoryUsage: true },
        },
      },
    });

    if (!subscriber) {
      return NextResponse.json(
        {
          subscriberId,
          subscriberName: "Not Found",
          status: "UNKNOWN",
          plan: "N/A",
          networkPath: [],
          speedTest: { download: "0 Mbps", upload: "0 Mbps", ping: "0 ms", jitter: "0 ms" },
          issues: [{ severity: "critical", title: "Subscriber Not Found", description: `No subscriber found matching "${subscriberId}". Check the ID, phone number, or PPPoE username.` }],
          resolutionSteps: ["Verify the subscriber ID or phone number", "Check the subscriber database for recent changes", "Contact support if the issue persists"],
          summary: "Could not find a subscriber matching the provided identifier. Please verify the input and try again.",
        },
        { status: 200 }
      );
    }

    // Get real complaint history
    const complaints = await db.complaint.findMany({
      where: { subscriberId: subscriber.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { Area: { select: { name: true } } },
    });

    // Get real RADIUS sessions
    const radiusUser = await db.radiusUser.findUnique({
      where: { subscriberId: subscriber.id },
      include: {
        RadiusSession: {
          orderBy: { startTime: "desc" },
          take: 5,
        },
      },
    });

    const activeSessions = radiusUser?.RadiusSession.filter((s) => !s.stopTime) || [];
    const recentSessions = radiusUser?.RadiusSession.slice(0, 5) || [];

    // Get real bandwidth/usage logs
    const usageLogs = await db.usageLog.findMany({
      where: { subscriberId: subscriber.id },
      orderBy: { timestamp: "desc" },
      take: 10,
    });

    const totalDownloadBytes = usageLogs.reduce((s, l) => s + Number(l.downloadBytes), 0);
    const totalUploadBytes = usageLogs.reduce((s, l) => s + Number(l.uploadBytes), 0);

    // Get real payment history
    const recentPayments = await db.payment.findMany({
      where: { subscriberId: subscriber.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { amount: true, status: true, createdAt: true, paymentMode: true },
    });

    // Get invoices to check overdue status
    const overdueInvoices = await db.invoice.findMany({
      where: {
        subscriberId: subscriber.id,
        status: { in: ["OVERDUE", "SENT", "DRAFT"] },
        dueDate: { lt: new Date() },
      },
      select: { invoiceNumber: true, balanceAmount: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    });

    // Get the assigned device's bandwidth logs for network path data
    const deviceBandwidthLogs = subscriber.assignedDeviceId
      ? await db.bandwidthLog.findMany({
          where: { deviceId: subscriber.assignedDeviceId },
          orderBy: { timestamp: "desc" },
          take: 5,
        })
      : [];

    const latestBandwidth = deviceBandwidthLogs[0];
    const currentLoad = latestBandwidth ? latestBandwidth.totalBps : 0;

    // Build real network path from actual device data in DB
    const planSpeed = subscriber.Plan ? subscriber.Plan.downloadSpeed / 1000 : 50; // Convert Kbps to Mbps
    const areaName = subscriber.Area?.name || "Service Area";
    const deviceName = subscriber.assignedDevice?.name || "Distribution Switch";
    const deviceIp = subscriber.assignedDevice?.ipAddress || "10.0.1.1";
    const deviceStatus = subscriber.assignedDevice?.status || "UNKNOWN";

    // Build network path from real device topology
    const networkPath: { hop: number; device: string; ip: string; latency: string; status: string }[] = [];

    // Walk up the device tree from assigned device to build path
    const buildDevicePath = async (deviceId: string): Promise<void> => {
      const device = await db.networkDevice.findUnique({
        where: { id: deviceId },
        select: { id: true, name: true, ipAddress: true, status: true, parentId: true, type: true },
      });
      if (!device) return;

      if (device.parentId) {
        await buildDevicePath(device.parentId);
      }

      networkPath.push({
        hop: networkPath.length + 1,
        device: device.name,
        ip: device.ipAddress || "unknown",
        latency: "—",
        status: device.status === "ONLINE" ? "OK" : device.status === "WARNING" ? "WARNING" : "UNKNOWN",
      });
    };

    if (subscriber.assignedDeviceId) {
      await buildDevicePath(subscriber.assignedDeviceId);
    }

    // If we found no devices, build a minimal path with what we know
    if (networkPath.length === 0) {
      networkPath.push(
        { hop: 1, device: deviceName, ip: deviceIp, latency: "—", status: deviceStatus === "ONLINE" ? "OK" : deviceStatus === "WARNING" ? "WARNING" : "UNKNOWN" },
        { hop: 2, device: "Customer Premise", ip: subscriber.ipAddress || "unknown", latency: "—", status: subscriber.status === "ACTIVE" ? "OK" : "WARNING" },
      );
    } else {
      // Append customer premise as last hop
      networkPath.push({
        hop: networkPath.length + 1,
        device: "Customer Premise",
        ip: subscriber.ipAddress || "unknown",
        latency: "—",
        status: subscriber.status === "ACTIVE" ? "OK" : "WARNING",
      });
    }

    // Calculate real speed metrics from bandwidth data
    const sessionDuration = recentSessions[0]?.acctSessionTime || 0;
    const sessionDownOctets = recentSessions[0]?.outputOctets ? Number(recentSessions[0].outputOctets) : 0;
    const sessionUpOctets = recentSessions[0]?.inputOctets ? Number(recentSessions[0].inputOctets) : 0;

    let measuredDownSpeed = planSpeed;
    let measuredUpSpeed = planSpeed * 0.4;

    // If we have session data with duration, calculate actual throughput
    if (sessionDuration > 0) {
      measuredDownSpeed = (sessionDownOctets * 8) / sessionDuration / 1000; // Mbps
      measuredUpSpeed = (sessionUpOctets * 8) / sessionDuration / 1000;
      // Cap at plan speed for realism
      measuredDownSpeed = Math.min(measuredDownSpeed, planSpeed);
      measuredUpSpeed = Math.min(measuredUpSpeed, planSpeed * 0.5);
    }

    // If no session data, derive from usage logs
    if (sessionDuration === 0 && usageLogs.length > 0) {
      const avgDown = totalDownloadBytes / usageLogs.length / 1024 / 1024; // MB per log entry
      measuredDownSpeed = Math.min(avgDown * 0.5, planSpeed); // rough estimate
      measuredUpSpeed = measuredDownSpeed * 0.35;
    }

    // For ping/jitter, attempt to derive from real data
    let pingMs: string | null = null;
    let jitterMs: string | null = null;

    // Try to get latency from bandwidth logs (if available with timing data)
    // Since BandwidthLog doesn't store latency directly, check if there's any
    // recent session data with round-trip info, or use null if unavailable
    if (deviceBandwidthLogs.length > 0 && deviceStatus === "ONLINE") {
      // We don't have direct latency data in the DB schema, so we indicate no measurement
      pingMs = null;
      jitterMs = null;
    } else if (deviceStatus !== "ONLINE") {
      pingMs = null;
      jitterMs = null;
    }

    const pingNote = pingMs === null ? "No real-time measurement available" : undefined;
    const jitterNote = jitterMs === null ? "No real-time measurement available" : undefined;

    const speedTest = {
      download: `${measuredDownSpeed.toFixed(1)} Mbps`,
      upload: `${measuredUpSpeed.toFixed(1)} Mbps`,
      ping: pingMs ? `${pingMs} ms` : null,
      jitter: jitterMs ? `${jitterMs} ms` : null,
      ...(pingNote && { pingNote }),
      ...(jitterNote && { jitterNote }),
    };

    // Determine real issues from data
    const issues: { severity: string; title: string; description: string }[] = [];

    if (subscriber.status !== "ACTIVE") {
      issues.push({
        severity: "critical",
        title: "Non-Active Connection",
        description: `Subscriber status is ${subscriber.status}. The connection may be suspended or disconnected. Check for overdue payments or account issues.`,
      });
    }

    if (complaints.length > 3) {
      issues.push({
        severity: "warning",
        title: "High Complaint History",
        description: `This subscriber has ${complaints.length} complaint(s) on record, suggesting recurring issues. Latest types: ${complaints.slice(0, 3).map((c) => c.type).join(", ")}.`,
      });
    }

    const openComplaints = complaints.filter((c) => !["CLOSED", "RESOLVED"].includes(c.status));
    if (openComplaints.length > 0) {
      issues.push({
        severity: "warning",
        title: `${openComplaints.length} Open Complaint(s)`,
        description: `There ${openComplaints.length === 1 ? "is" : "are"} ${openComplaints.length} unresolved complaint(s). Ticket(s): ${openComplaints.map((c) => c.ticketNumber).join(", ")}.`,
      });
    }

    if (measuredDownSpeed < planSpeed * 0.6) {
      issues.push({
        severity: "critical",
        title: "Speed Significantly Below Plan Limit",
        description: `Measured download speed (${measuredDownSpeed.toFixed(1)} Mbps) is well below plan speed (${planSpeed} Mbps). This indicates possible congestion, fiber issues, or equipment problems.`,
      });
    } else if (measuredDownSpeed < planSpeed * 0.8) {
      issues.push({
        severity: "warning",
        title: "Speed Below Plan Limit",
        description: `Measured download speed (${measuredDownSpeed.toFixed(1)} Mbps) is slightly below plan speed (${planSpeed} Mbps). Could be due to temporary congestion.`,
      });
    }

    if (deviceStatus !== "ONLINE" && subscriber.assignedDeviceId) {
      issues.push({
        severity: "critical",
        title: "Assigned Device Not Online",
        description: `The assigned network device (${deviceName}) status is ${deviceStatus}. This may affect connectivity.`,
      });
    }

    if (activeSessions.length === 0 && subscriber.status === "ACTIVE") {
      issues.push({
        severity: "warning",
        title: "No Active RADIUS Session",
        description: "Subscriber has no active RADIUS session despite being ACTIVE. The connection may be down or the user hasn't connected recently.",
      });
    }

    if (overdueInvoices.length > 0) {
      const totalOverdue = overdueInvoices.reduce((s, i) => s + i.balanceAmount, 0);
      issues.push({
        severity: "warning",
        title: `${overdueInvoices.length} Overdue Invoice(s)`,
        description: `Total overdue amount: ₹${Math.round(totalOverdue).toLocaleString("en-IN")}. Payment issues could lead to service suspension.`,
      });
    }

    if (issues.length === 0) {
      issues.push({
        severity: "info",
        title: "No Issues Detected",
        description: "All systems appear to be functioning normally for this subscriber.",
      });
    }

    // Build context for LLM
    const diagnosisContext = `## Subscriber Diagnosis Data

### Subscriber Info
- Name: ${subscriber.name} (${subscriber.code})
- Status: ${subscriber.status}
- Plan: ${subscriber.Plan?.name || "No Plan"} - ${planSpeed} Mbps
- Area: ${areaName}
- Connection Type: ${subscriber.connectionType}
- Service Username: ${subscriber.serviceUsername}
- Activated: ${subscriber.activationDate || "Not activated"}

### Current Speed Metrics
- Download: ${speedTest.download} (Plan: ${planSpeed} Mbps)
- Upload: ${speedTest.upload}
- Ping: ${speedTest.ping || "Not measured"}${pingNote ? ` (${pingNote})` : ""}
- Jitter: ${speedTest.jitter || "Not measured"}${jitterNote ? ` (${jitterNote})` : ""}

### RADIUS / Session Data
- Active sessions: ${activeSessions.length}
- Recent session duration: ${sessionDuration > 0 ? `${Math.round(sessionDuration / 60)} minutes` : "No recent sessions"}
- Session download: ${sessionDownOctets > 0 ? `${(sessionDownOctets / 1024 / 1024).toFixed(1)} MB` : "N/A"}
- Session upload: ${sessionUpOctets > 0 ? `${(sessionUpOctets / 1024 / 1024).toFixed(1)} MB` : "N/A"}

### Usage Data
- Total usage (recent): ${((totalDownloadBytes + totalUploadBytes) / 1024 / 1024 / 1024).toFixed(2)} GB
- Download: ${(totalDownloadBytes / 1024 / 1024).toFixed(1)} MB
- Upload: ${(totalUploadBytes / 1024 / 1024).toFixed(1)} MB

### Complaint History (${complaints.length} total)
${complaints.map((c) => `- [${c.status}] ${c.type}: ${c.description.substring(0, 80)}${c.description.length > 80 ? "..." : ""}`).join("\n") || "No complaints"}

### Payment Status
- Overdue invoices: ${overdueInvoices.length} (₹${Math.round(overdueInvoices.reduce((s, i) => s + i.balanceAmount, 0)).toLocaleString("en-IN")})
- Recent payments: ${recentPayments.map((p) => `₹${p.amount} (${p.status}, ${p.paymentMode}, ${p.createdAt.toLocaleDateString("en-IN")})`).join("; ") || "No recent payments"}

### Assigned Device
- ${subscriber.assignedDevice ? `${subscriber.assignedDevice.name} (${subscriber.assignedDevice.ipAddress}) - Status: ${subscriber.assignedDevice.status}, CPU: ${subscriber.assignedDevice.cpuUsage}%, MEM: ${subscriber.assignedDevice.memoryUsage}%` : "No device assigned"}

### Detected Issues
${issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")}`;

    // Call LLM for comprehensive analysis
    let summary: string = "";
    let aiResolutionSteps: string[] = [];

    try {
      const zai = await ZAI.create();
      const response = await zai.chat.completions.create({
        messages: [
          { role: "system", content: DIAGNOSIS_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this subscriber's network diagnosis data and provide:\n1. A comprehensive summary of the subscriber's network health\n2. Numbered resolution steps (5-8 steps max)\n\n${diagnosisContext}\n\nProvide specific, actionable recommendations. Reference actual data points. Keep the summary concise (3-5 sentences). For resolution steps, be specific about what to check and in what order.`,
          },
        ],
      });

      const aiContent = response?.choices?.[0]?.message?.content || "";

      // Parse the LLM response - try to extract structured sections
      if (aiContent) {
        // Try to split into summary and steps
        const stepsMatch = aiContent.match(/(?:resolution steps|recommended steps|action plan)[:\s]*\n([\s\S]*?)$/i);
        if (stepsMatch) {
          const stepsText = stepsMatch[1];
          // Extract numbered steps
          const stepLines = stepsText.match(/^\s*\d+[\.\)]\s+.+$/gm);
          if (stepLines && stepLines.length > 0) {
            aiResolutionSteps = stepLines.map((s) => s.replace(/^\s*\d+[\.\)]\s+/, "").trim());
          }
          // Summary is everything before the steps section
          summary = aiContent.substring(0, aiContent.indexOf(stepsMatch[0])).trim();
        } else {
          // If no clear structure, use the whole response as summary
          summary = aiContent;
        }
      }
    } catch (llmError) {
      console.error("LLM call failed in diagnosis, using rule-based fallback:", llmError);
      // Fallback summary based on data
      const criticalIssues = issues.filter((i) => i.severity === "critical");
      summary = criticalIssues.length > 0
        ? `Diagnosis for ${subscriber.name} (${subscriber.code}): ${criticalIssues.length} critical issue(s) found. ${criticalIssues.map((i) => i.title).join(", ")}. Immediate attention required.`
        : issues.some((i) => i.severity === "warning")
          ? `Diagnosis for ${subscriber.name} (${subscriber.code}): Some warnings detected. Connection is functional but ${issues.filter((i) => i.severity === "warning").length} area(s) need attention.`
          : `Diagnosis for ${subscriber.name} (${subscriber.code}): Connection is healthy with no significant issues. All metrics within expected parameters.`;
    }

    // Use LLM steps if available, otherwise use rule-based steps
    const resolutionSteps = aiResolutionSteps.length > 0
      ? aiResolutionSteps
      : [];

    if (resolutionSteps.length === 0) {
      if (issues.some((i) => i.title.includes("Speed"))) {
        resolutionSteps.push(
          "Check OLT port signal levels (Tx/Rx power) for the subscriber",
          "Inspect fiber patch cord and connections at ODF/ODP",
          "Verify ONT/ONU registration and provisioning on the OLT",
          "Test with a known-good ONT/ONU to isolate equipment issues",
          "Check for bandwidth congestion on the distribution segment",
          "Verify RADIUS speed profile matches the subscriber's plan",
          "Monitor bandwidth logs over 24 hours to identify peak usage patterns"
        );
      } else if (issues.some((i) => i.title.includes("Complaint"))) {
        resolutionSteps.push(
          "Review all past complaint tickets for recurring patterns",
          "Check the last technician visit notes and actions taken",
          "Schedule a preventive maintenance visit",
          "Consider upgrading the customer's connection equipment",
          "Offer a plan upgrade if speed-related complaints are frequent"
        );
      } else {
        resolutionSteps.push(
          "Connection is healthy - no immediate action needed",
          "Schedule routine maintenance check in 30 days",
          "Monitor usage patterns for any anomalies"
        );
      }
    }

    return NextResponse.json({
      subscriberId: subscriber.id,
      subscriberName: subscriber.name,
      status: subscriber.status,
      plan: subscriber.Plan?.name || "No Plan",
      networkPath,
      speedTest,
      issues,
      resolutionSteps,
      summary,
    });
  } catch (error) {
    console.error("Diagnosis failed:", error);
    return NextResponse.json({ error: "Diagnosis failed. Please try again." }, { status: 500 });
  }
}
