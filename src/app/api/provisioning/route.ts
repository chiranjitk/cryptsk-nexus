import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ============================================================
// Batch Provisioning — Templates + Jobs
// ============================================================

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List all templates ──────────────────────────────────
    if (action === "list-templates") {
      const templates = await db.provisioningTemplate.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        include: {
          jobs: {
            select: { id: true, status: true, createdAt: true },
            take: 5,
            orderBy: { createdAt: "desc" },
          },
        },
      });
      return NextResponse.json({ templates });
    }

    // ── List batch jobs (with optional status filter) ──────
    if (action === "list-jobs") {
      const status = searchParams.get("status");
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "25");

      const where: Record<string, unknown> = {};
      if (status && status !== "ALL") {
        where.status = status;
      }

      const [jobs, total] = await Promise.all([
        db.batchProvisioningJob.findMany({
          where,
          include: {
            template: {
              select: {
                id: true,
                name: true,
                planId: true,
                areaId: true,
                connectionType: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.batchProvisioningJob.count({ where }),
      ]);

      return NextResponse.json({ jobs, total, page, limit });
    }

    // ── Get single job details ─────────────────────────────
    if (action === "get-job") {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
      }

      const job = await db.batchProvisioningJob.findUnique({
        where: { id },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              planId: true,
              areaId: true,
              connectionType: true,
              bindToMac: true,
              autoAssignIp: true,
            },
          },
        },
      });

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json({ job });
    }

    return NextResponse.json({ error: "Invalid action. Use: list-templates, list-jobs, get-job" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Provisioning GET error:", error);
    return NextResponse.json({ error: "Failed to fetch provisioning data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Create template ────────────────────────────────────
    if (action === "create-template") {
      const { name, description, planId, areaId, connectionType, bindToMac, autoAssignIp } = body;

      if (!name) {
        return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
      }

      const template = await db.provisioningTemplate.create({
        data: {
          name,
          description: description || "",
          planId: planId || null,
          areaId: areaId || null,
          connectionType: connectionType || "FTTH",
          bindToMac: bindToMac ?? false,
          autoAssignIp: autoAssignIp ?? false,
        },
      });

      return NextResponse.json({ template }, { status: 201 });
    }

    // ── Update template ────────────────────────────────────
    if (action === "update-template") {
      const { id, name, description, planId, areaId, connectionType, bindToMac, autoAssignIp, isActive } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.provisioningTemplate.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const template = await db.provisioningTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(planId !== undefined && { planId: planId || null }),
          ...(areaId !== undefined && { areaId: areaId || null }),
          ...(connectionType !== undefined && { connectionType }),
          ...(bindToMac !== undefined && { bindToMac }),
          ...(autoAssignIp !== undefined && { autoAssignIp }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      return NextResponse.json({ template });
    }

    // ── Delete template ────────────────────────────────────
    if (action === "delete-template") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.provisioningTemplate.findUnique({
        where: { id },
        include: { jobs: { select: { id: true, status: true } } },
      });

      if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const activeJobs = existing.jobs.filter(
        (j) => j.status === "PENDING" || j.status === "IN_PROGRESS"
      );
      if (activeJobs.length > 0) {
        return NextResponse.json(
          { error: "Cannot delete template with active jobs. Cancel them first." },
          { status: 409 }
        );
      }

      await db.provisioningTemplate.delete({ where: { id } });

      return NextResponse.json({ success: true });
    }

    // ── Create batch job ───────────────────────────────────
    if (action === "create-job") {
      const { templateId, filename } = body;

      if (!templateId) {
        return NextResponse.json({ error: "Missing required field: templateId" }, { status: 400 });
      }

      const template = await db.provisioningTemplate.findUnique({ where: { id: templateId } });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      if (!template.isActive) {
        return NextResponse.json({ error: "Template is inactive. Activate it before creating jobs." }, { status: 400 });
      }

      const job = await db.batchProvisioningJob.create({
        data: {
          templateId,
          filename: filename || "",
          status: "PENDING",
          totalUsers: 0,
          completedUsers: 0,
          failedUsers: 0,
        },
        include: {
          template: {
            select: { id: true, name: true },
          },
        },
      });

      return NextResponse.json({ job }, { status: 201 });
    }

    // ── Start job ──────────────────────────────────────────
    if (action === "start-job") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const job = await db.batchProvisioningJob.findUnique({ where: { id } });
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      if (job.status !== "PENDING") {
        return NextResponse.json(
          { error: `Cannot start job with status: ${job.status}. Only PENDING jobs can be started.` },
          { status: 400 }
        );
      }

      const updated = await db.batchProvisioningJob.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });

      return NextResponse.json({ job: updated });
    }

    // ── Update job progress ────────────────────────────────
    if (action === "update-progress") {
      const { id, completedUsers, failedUsers, status, errorDetail, totalUsers } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const job = await db.batchProvisioningJob.findUnique({ where: { id } });
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      if (job.status === "COMPLETED" || job.status === "CANCELLED") {
        return NextResponse.json(
          { error: `Cannot update a ${job.status} job.` },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (completedUsers !== undefined) updateData.completedUsers = completedUsers;
      if (failedUsers !== undefined) updateData.failedUsers = failedUsers;
      if (totalUsers !== undefined) updateData.totalUsers = totalUsers;
      if (errorDetail !== undefined) updateData.errorDetail = errorDetail;

      if (status) {
        updateData.status = status;
        if (status === "COMPLETED" || status === "FAILED") {
          updateData.completedAt = new Date();
        }
      }

      // Auto-complete if all users processed
      const newCompleted = completedUsers ?? job.completedUsers;
      const newFailed = failedUsers ?? job.failedUsers;
      const newTotal = totalUsers ?? job.totalUsers;
      if (newTotal > 0 && newCompleted + newFailed >= newTotal && !status) {
        updateData.status = newFailed > 0 ? "FAILED" : "COMPLETED";
        updateData.completedAt = new Date();
      }

      const updated = await db.batchProvisioningJob.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ job: updated });
    }

    // ── Cancel job ─────────────────────────────────────────
    if (action === "cancel-job") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const job = await db.batchProvisioningJob.findUnique({ where: { id } });
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      if (job.status === "COMPLETED" || job.status === "CANCELLED") {
        return NextResponse.json(
          { error: `Cannot cancel a ${job.status} job.` },
          { status: 400 }
        );
      }

      const updated = await db.batchProvisioningJob.update({
        where: { id },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
        },
      });

      return NextResponse.json({ job: updated });
    }

    return NextResponse.json(
      {
        error:
          "Invalid action. Use: create-template, update-template, delete-template, create-job, start-job, update-progress, cancel-job",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Provisioning POST error:", error);
    return NextResponse.json({ error: "Failed to process provisioning request" }, { status: 500 });
  }
}
