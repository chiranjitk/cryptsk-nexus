import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserProfile, hasPermission } from '@/lib/auth/tenant-context';
import { z } from 'zod';

// ──────────────────────────────────────────────
// Zod validation schema for POST (create WiFiPlan as portal/captive portal plan)
// ──────────────────────────────────────────────
const createPortalPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(100),
  description: z.string().max(500).nullable().optional(),
  downloadSpeed: z.number().positive('Download speed must be positive'),
  uploadSpeed: z.number().positive('Upload speed must be positive'),
  burstDownloadSpeed: z.number().positive().nullable().optional(),
  burstUploadSpeed: z.number().positive().nullable().optional(),
  dataLimit: z.number().int().min(0).nullable().optional(),
  sessionLimit: z.number().int().min(0).nullable().optional(),
  sessionTimeoutSec: z.number().int().min(0).nullable().optional(),
  idleTimeoutSec: z.number().int().min(0).nullable().optional(),
  maxDevices: z.number().int().min(1).max(5000).default(1),
  filterGroup: z.number().int().min(1).max(3).default(2),
  price: z.number().min(0, 'Price must be non-negative').default(0),
  currency: z.string().min(3).max(3).default('USD'),
  priority: z.number().int().default(0),
  validityDays: z.number().int().min(1).default(1),
  validityMinutes: z.number().int().min(1).default(1440),
  billingModel: z.enum(['flat', 'usage', 'tiered', 'hybrid']).default('flat'),
  includedDataMb: z.number().int().min(0).default(0),
  pricePerMb: z.number().min(0).default(0),
  status: z.string().max(50).default('active'),
});

// GET /api/wifi/portal/portals — List portal plans (WiFiPlans) with filters
export async function GET(request: NextRequest) {
  const user = await getUserProfile(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  if (!hasPermission(user as any, 'wifi.view')) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Permission denied: wifi.view' } },
      { status: 403 },
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // WiFiPlan does NOT have partnerId — it's tenant-scoped only
    const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (status) where.status = status;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' as const };
    }

    const [data, total] = await Promise.all([
      db.wiFiPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              sessions: true,
              wifiUsers: true,
              vouchers: true,
            },
          },
        },
      }),
      db.wiFiPlan.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    console.error('[wifi/portal/portals] GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal plans' } },
      { status: 500 },
    );
  }
}

// POST /api/wifi/portal/portals — Create a WiFiPlan (portal / captive portal plan)
export async function POST(request: NextRequest) {
  const user = await getUserProfile(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  if (!hasPermission(user as any, 'wifi.manage')) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Permission denied: wifi.manage' } },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const parsed = createPortalPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const created = await db.wiFiPlan.create({
      data: {
        tenantId: user.tenantId,
        name: data.name,
        description: data.description ?? null,
        downloadSpeed: data.downloadSpeed,
        uploadSpeed: data.uploadSpeed,
        burstDownloadSpeed: data.burstDownloadSpeed ?? null,
        burstUploadSpeed: data.burstUploadSpeed ?? null,
        filterGroup: data.filterGroup,
        dataLimit: data.dataLimit ?? null,
        sessionLimit: data.sessionLimit ?? null,
        sessionTimeoutSec: data.sessionTimeoutSec ?? null,
        idleTimeoutSec: data.idleTimeoutSec ?? null,
        maxDevices: data.maxDevices,
        price: data.price,
        currency: data.currency,
        priority: data.priority,
        validityDays: data.validityDays,
        validityMinutes: data.validityMinutes,
        billingModel: data.billingModel,
        includedDataMb: data.includedDataMb,
        pricePerMb: data.pricePerMb,
        status: data.status,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('[wifi/portal/portals] POST error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal plan' } },
      { status: 500 },
    );
  }
}