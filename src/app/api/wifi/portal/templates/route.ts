import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

/** Strip dangerous HTML from template content to prevent XSS. */
function sanitizeTemplateHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\s*\/?>/gi, '')
    .replace(/\son\w+\s*=/gi, 'data-blocked=')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .trim();
}

/** Strip dangerous CSS expressions from template CSS. */
function sanitizeTemplateCss(css: string | undefined): string {
  if (!css) return '';
  return css
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(blocked:')
    .replace(/@import\s+url\s*\(/gi, '/* blocked */')
    .replace(/behavior\s*:/gi, 'blocked:')
    .trim();
}

// GET /api/wifi/portal/templates - List portal templates
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const includeBuiltIn = searchParams.get('includeBuiltIn');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (!includeBuiltIn || includeBuiltIn !== 'true') {
      where.isBuiltIn = false;
    }

    if (category) where.category = category;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const templates = await db.portalTemplate.findMany({
      where,
      orderBy: [{ isBuiltIn: 'asc' }, { createdAt: 'desc' }],
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.portalTemplate.count({ where });

    return NextResponse.json({
      success: true,
      data: templates,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching portal templates:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal templates' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/templates - Create portal template
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
// REMOVED:     const tenantId = user.tenantId;

    const {
      name,
      description,
      category = 'hotel',
      thumbnail,
      htmlContent,
      cssContent,
    } = body;

    if (!name || !htmlContent || !cssContent) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: name, htmlContent, cssContent' } },
        { status: 400 }
      );
    }

    const template = await db.portalTemplate.create({
      data: {
// REMOVED:         tenantId,
        name,
        description,
        category,
        thumbnail,
        htmlContent: sanitizeTemplateHtml(htmlContent),
        cssContent: sanitizeTemplateCss(cssContent),
        isBuiltIn: false,
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error('Error creating portal template:', error);
    logWifi(request, 'create', 'portal_template', template.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal template' } },
      { status: 500 }
    );
  }
}
