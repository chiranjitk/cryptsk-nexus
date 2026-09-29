import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { type, deviceId } = await request.json();

    let devices;
    if (type === "device" && deviceId) {
      devices = await db.networkDevice.findMany({ where: { id: deviceId }, include: { Area: true, interfaces: true } });
    } else {
      devices = await db.networkDevice.findMany({ include: { Area: true, interfaces: true } });
    }

    const issues: { severity: string; device: string; description: string; recommendation: string }[] = [];
    let healthScore = 100;

    for (const device of devices) {
      if (device.status === "OFFLINE") {
        issues.push({ severity: "CRITICAL", device: device.name, description: "Device is offline", recommendation: "Check network connectivity and power supply. Contact technician for on-site inspection." });
        healthScore -= 15;
      }
      if (device.cpuUsage > 80) {
        issues.push({ severity: "WARNING", device: device.name, description: `CPU usage at ${device.cpuUsage}%`, recommendation: "Review running processes. Consider upgrading hardware or redistributing load." });
        healthScore -= 5;
      }
      if (device.memoryUsage > 80) {
        issues.push({ severity: "WARNING", device: device.name, description: `Memory usage at ${device.memoryUsage}%`, recommendation: "Check for memory leaks. Restart services if needed." });
        healthScore -= 5;
      }
      if (device.temperature && device.temperature > 70) {
        issues.push({ severity: "WARNING", device: device.name, description: `Temperature at ${device.temperature}°C`, recommendation: "Check cooling systems and ventilation. High temperature may cause hardware failure." });
        healthScore -= 5;
      }
      if (device.status === "ONLINE" && device.interfaces.length > 0) {
        const downInterfaces = device.interfaces.filter((i) => i.status === "DOWN");
        if (downInterfaces.length > 0) {
          issues.push({ severity: "INFO", device: device.name, description: `${downInterfaces.length} interface(s) down`, recommendation: "Check physical connections and interface configurations." });
          healthScore -= 2;
        }
      }
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    const recentComplaints = await db.complaint.count({
      where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
    });

    return NextResponse.json({
      healthScore,
      totalDevices: devices.length,
      issues,
      recentOpenComplaints: recentComplaints,
      recommendations: issues.length > 0
        ? issues.map((i) => `[${i.severity}] ${i.device}: ${i.recommendation}`)
        : ["All systems are healthy. No immediate actions needed."],
      diagnosisTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI Diagnosis error:", error);
    return NextResponse.json({ error: "Diagnosis failed" }, { status: 500 });
  }
}
