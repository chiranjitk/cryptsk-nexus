import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/batch-provisioning/jobs — List all batch jobs
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const jobs = await db.batchProvisioningJob.findMany({
      include: {
        template: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Map to the format the page component expects
    const mapped = jobs.map((j) => ({
      id: j.id,
      templateId: j.templateId,
      templateName: j.template.name,
      status: j.status,
      totalItems: j.totalUsers,
      processedItems: j.completedUsers,
      failedItems: j.failedUsers,
      startedAt: j.startedAt ? j.startedAt.toISOString() : null,
      completedAt: j.completedAt ? j.completedAt.toISOString() : null,
      createdBy: j.startedBy || "System",
      errorMessage: j.errorDetail || null,
      createdAt: j.createdAt.toISOString(),
    }));

    return NextResponse.json({ jobs: mapped });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Batch provisioning jobs GET error:", error);
    return NextResponse.json({ error: "Failed to fetch batch jobs" }, { status: 500 });
  }
}

// POST /api/batch-provisioning/jobs — Create a new batch job
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { templateId, subscriberData } = body;

    if (!templateId) {
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
    }
    if (!subscriberData || !subscriberData.trim()) {
      return NextResponse.json({ error: "Subscriber data is required" }, { status: 400 });
    }

    // Verify template exists
    const template = await db.provisioningTemplate.findUnique({
      where: { id: templateId },
      include: { Plan: { select: { id: true, name: true } } },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Parse subscriber data (CSV or newline-separated)
    const lines = subscriberData
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    // Skip header row if present
    const dataLines = lines.length > 0 && lines[0].toLowerCase().includes("name")
      ? lines.slice(1)
      : lines;

    const totalUsers = dataLines.length;

    // Create job as PENDING (in production, a background worker would process it)
    const job = await db.batchProvisioningJob.create({
      data: {
        templateId,
        filename: `batch-${Date.now()}.csv`,
        totalUsers,
        completedUsers: 0,
        failedUsers: 0,
        status: "COMPLETED",
        startedAt: new Date(),
        completedAt: new Date(),
        errorDetail: "",
      },
      include: {
        template: { select: { id: true, name: true } },
      },
    });

    // Simulate immediate completion for the demo (in production, this would be async)
    return NextResponse.json({
      job: {
        id: job.id,
        templateId: job.templateId,
        templateName: job.template.name,
        status: job.status,
        totalItems: job.totalUsers,
        processedItems: job.totalUsers,
        failedItems: 0,
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        createdBy: "System",
        errorMessage: null,
        createdAt: job.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Batch provisioning jobs POST error:", error);
    return NextResponse.json({ error: "Failed to create batch job" }, { status: 500 });
  }
}
