import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize HTML content to prevent XSS in captive portal pages.
 * Uses sanitize-html library for comprehensive protection.
 */
function sanitizePortalHtml(html: string | null | undefined): string {
  if (!html) return '';
  const result = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'hr', 'br', 'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'b', 'i', 'em', 'strong', 'u', 'center',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'pre', 'code',
      'section', 'article', 'header', 'footer', 'nav', 'figure', 'figcaption',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
      a: ['href', 'target', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      th: ['colspan', 'rowspan', 'style'],
      table: ['style'], div: ['style', 'class', 'id'], span: ['style', 'class', 'id'], p: ['style', 'class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });
  return result.trim() || '';
}

/** Strip dangerous CSS to prevent CSS-based attacks. */
function sanitizePortalCss(css: string | null | undefined): string {
  if (!css) return '';
  const sanitized = css
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/url\s*\(\s*['"]?\s*javascript\s*:[^)]*\)/gi, '')
    .replace(/@import\s+[^;]+;/gi, '')
    .replace(/behavior\s*:[^;]*;/gi, '')
    .replace(/-moz-binding\s*:[^;]*;/gi, '')
    .replace(/expr\65ssion\s*\([^)]*\)/gi, '')
    .replace(/expre\s*\/\*.*?\*\/ssion\s*\([^)]*\)/gi, '')
    .trim();
  return sanitized || '';
}

// GET /api/wifi/portal/pages - List portal pages or get by portalId
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const portalId = searchParams.get('portalId');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (portalId) {
      where.portalId = portalId;
    }

    const pages = await db.portalPage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: pages });
  } catch (error) {
    console.error('Error fetching portal pages:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal pages' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/pages - Create portal page design
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { portalId, language, ...pageData } = body;

    if (!portalId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'portalId is required' } },
        { status: 400 }
      );
    }

    // Verify portal belongs to tenant
    const portal = await db.captivePortal.findFirst({
// REMOVED:       where: { id: portalId, tenantId: user.tenantId },
    });
    if (!portal) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal not found' } },
        { status: 404 }
      );
    }

    // Check if page already exists for this portal+language (upsert)
    const existing = await db.portalPage.findUnique({
      where: { portalId_language: { portalId, language: language || 'en' } },
    });

    const pagePayload = {
      title: pageData.title,
      subtitle: pageData.subtitle,
      logoUrl: pageData.logoUrl,
      backgroundImage: pageData.backgroundImage ?? pageData.backgroundImageUrl,
      backgroundColor: pageData.backgroundColor,
      textColor: pageData.textColor,
      accentColor: pageData.brandColor || pageData.accentColor,
      termsText: pageData.termsText,
      termsUrl: pageData.termsUrl,
      customCss: sanitizePortalCss(pageData.customCss ?? pageData.customCSS),
      customHtml: sanitizePortalHtml(pageData.customHtml ?? pageData.customHTML),
      showSocial: pageData.showSocial ?? (pageData.socialLogin?.google || pageData.socialLogin?.facebook || pageData.socialLogin?.apple ? true : false),
      showBranding: pageData.showBranding,
      formFields: typeof pageData.formFields === 'string' ? pageData.formFields : JSON.stringify(pageData.formFields),
      authFlow: pageData.authFlow,
      socialProviders: typeof pageData.socialProviders === 'string' ? pageData.socialProviders : JSON.stringify(pageData.socialLogin || pageData.socialProviders),
      voucherTemplate: pageData.voucherTemplate,
      designSettings: typeof pageData.designSettings === 'string' ? pageData.designSettings : JSON.stringify(pageData.designSettings || {}),
    };

    // Sync authFlow back to CaptivePortal.authMethod so the Portal
    // Instances tab stays in sync with the Portal Designer setting.
    if (pageData.authFlow) {
      await db.captivePortal.update({
        where: { id: portalId },
        data: { authMethod: pageData.authFlow },
      }).catch(() => { /* best-effort sync */ });
    }

    if (existing) {
      // Update existing
      const updated = await db.portalPage.update({
        where: { id: existing.id },
        data: pagePayload,
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Create new
    const page = await db.portalPage.create({
      data: {
// REMOVED:         tenantId: user.tenantId,
        portalId,
        language: language || 'en',
        ...pagePayload,
      },
    });

    return NextResponse.json({ success: true, data: page }, { status: 201 });
  } catch (error) {
    console.error('Error creating portal page:', error);
    logWifi(request, 'create', 'portal_page', page.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal page' } },
      { status: 500 }
    );
  }
}
