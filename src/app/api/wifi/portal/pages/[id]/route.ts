import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { getWifiSettings, setWifiSettings, type ConsentManagementSettings } from '@/lib/wifi-settings';
import sanitizeHtml from 'sanitize-html';
import { logWifi } from '@/lib/audit';

/** Sanitize HTML — same logic as POST handler in pages/route.ts */
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

/** Sanitize CSS — same logic as POST handler */
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

// PUT /api/wifi/portal/pages/[id] - Update portal page design
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const existing = await db.portalPage.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== user.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal page not found' } },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.subtitle !== undefined) updatePayload.subtitle = body.subtitle;
    if (body.logoUrl !== undefined) updatePayload.logoUrl = body.logoUrl;
    if (body.backgroundImage !== undefined) updatePayload.backgroundImage = body.backgroundImage;
    if (body.backgroundImageUrl !== undefined) updatePayload.backgroundImage = body.backgroundImageUrl;
    if (body.backgroundColor !== undefined) updatePayload.backgroundColor = body.backgroundColor;
    if (body.textColor !== undefined) updatePayload.textColor = body.textColor;
    if (body.accentColor !== undefined) updatePayload.accentColor = body.accentColor;
    if (body.brandColor !== undefined) updatePayload.accentColor = body.brandColor;
    if (body.termsText !== undefined) updatePayload.termsText = body.termsText;
    if (body.termsUrl !== undefined) updatePayload.termsUrl = body.termsUrl;
    if (body.customCss !== undefined) updatePayload.customCss = sanitizePortalCss(body.customCss);
    if (body.customCSS !== undefined) updatePayload.customCss = sanitizePortalCss(body.customCSS);
    if (body.customHtml !== undefined) updatePayload.customHtml = sanitizePortalHtml(body.customHtml);
    if (body.customHTML !== undefined) updatePayload.customHtml = sanitizePortalHtml(body.customHTML);
    if (body.showSocial !== undefined) updatePayload.showSocial = body.showSocial;
    if (body.showBranding !== undefined) updatePayload.showBranding = body.showBranding;
    if (body.formFields !== undefined) updatePayload.formFields = typeof body.formFields === 'string' ? body.formFields : JSON.stringify(body.formFields);
    if (body.authFlow !== undefined) updatePayload.authFlow = body.authFlow;
    if (body.socialProviders !== undefined) updatePayload.socialProviders = typeof body.socialProviders === 'string' ? body.socialProviders : JSON.stringify(body.socialProviders);
    if (body.socialLogin !== undefined) updatePayload.socialProviders = JSON.stringify(body.socialLogin);
    if (body.voucherTemplate !== undefined) updatePayload.voucherTemplate = body.voucherTemplate;
    if (body.designSettings !== undefined) updatePayload.designSettings = typeof body.designSettings === 'string' ? body.designSettings : JSON.stringify(body.designSettings);

    const updated = await db.portalPage.update({
      where: { id },
      data: updatePayload,
    });

    // Sync authFlow back to CaptivePortal.authMethod so the Portal
    // Instances tab stays in sync with the Portal Designer setting.
    if (updatePayload.authFlow && existing.portalId) {
      await db.captivePortal.update({
        where: { id: existing.portalId },
        data: { authMethod: updatePayload.authFlow },
      }).catch(() => { /* best-effort sync */ });
    }

    // Sync marketingOptIn + termsText changes back to WiFiSettings.consent_management
    // so the Portal Designer and GDPR Consent Management page stay in sync.
    if (updatePayload.designSettings || updatePayload.termsText || updatePayload.termsUrl) {
      try {
        // Get the latest termsText from both the dedicated column and designSettings
        let termsText = existing.termsText || '';
        let termsUrl = existing.termsUrl || '';
        if (updatePayload.termsText) termsText = updatePayload.termsText as string;
        if (updatePayload.termsUrl) termsUrl = updatePayload.termsUrl as string;

        // Also check designSettings for termsText/termsUrl
        let dsTermsText = '';
        let dsMarketingOptIn: Record<string, unknown> | null = null;
        if (updatePayload.designSettings) {
          const ds = JSON.parse(updatePayload.designSettings as string);
          dsTermsText = ds.termsText || '';
          dsMarketingOptIn = ds.marketingOptIn || null;
        }
        // designSettings termsText takes priority over column
        const effectiveTermsText = dsTermsText || termsText;
        const effectiveTermsUrl = (() => {
          try {
            const ds = updatePayload.designSettings
              ? JSON.parse(updatePayload.designSettings as string)
              : null;
            return ds?.termsUrl || termsUrl;
          } catch { return termsUrl; }
        })();

        const currentGdpr = await getWifiSettings(existing.tenantId, 'consent_management');
        const gdprUpdate: Partial<ConsentManagementSettings> = {};

        // Sync marketingOptIn.enabled
        if (dsMarketingOptIn && typeof dsMarketingOptIn.enabled === 'boolean') {
          gdprUpdate.showMarketingOptIn = dsMarketingOptIn.enabled;
          // Sync marketing consent text
          gdprUpdate.consentText = String(dsMarketingOptIn.consentText || '') || (currentGdpr as ConsentManagementSettings).consentText || '';
        }

        // Sync termsText to GDPR consentText if portal has terms
        if (effectiveTermsText) {
          gdprUpdate.consentText = effectiveTermsText;
        }
        // Sync termsUrl to cookiePolicyUrl as fallback
        if (effectiveTermsUrl) {
          gdprUpdate.cookiePolicyUrl = effectiveTermsUrl;
        }

        if (Object.keys(gdprUpdate).length > 0) {
          await setWifiSettings(existing.tenantId, 'consent_management', {
            ...(currentGdpr as ConsentManagementSettings),
            ...gdprUpdate,
          });
          console.log(`[Portal Designer] Synced termsText + marketingOptIn to WiFiSettings consent_management`);
        }
      } catch {
        // Non-fatal: GDPR sync failure should not block the portal page save
      }
    }

    logWifi(request, 'update', 'portal_page', id).catch(() => {});
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating portal page:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update portal page' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/pages/[id] - Delete portal page design
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.portalPage.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== user.tenantId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal page not found' } },
        { status: 404 }
      );
    }

    await db.portalPage.delete({ where: { id } });

    logWifi(request, 'delete', 'portal_page', id).catch(() => {});
    return NextResponse.json({ success: true, message: 'Portal page deleted' });
  } catch (error) {
    console.error('Error deleting portal page:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete portal page' } },
      { status: 500 }
    );
  }
}
