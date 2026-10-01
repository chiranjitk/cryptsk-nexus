import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { requirePermission } from '@/lib/auth/tenant-context';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', zh: 'Chinese Simplified',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', pt: 'Portuguese',
  ru: 'Russian', it: 'Italian', nl: 'Dutch', th: 'Thai', vi: 'Vietnamese', tr: 'Turkish',
};

export async function POST(req: NextRequest) {
  try {
    // Auth guard — must check the return value (returns NextResponse on failure, does not throw)
    const authResult = await requirePermission(req, 'wifi.manage');
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { texts, targetLang, sourceLang = 'English' } = body as {
      texts: Record<string, string>;
      targetLang: string;
      sourceLang?: string;
    };

    // Validate inputs
    if (!texts || typeof texts !== 'object' || Object.keys(texts).length === 0) {
      return NextResponse.json({ success: false, error: { message: 'texts must be a non-empty object of key-value pairs' } }, { status: 400 });
    }

    if (!targetLang || typeof targetLang !== 'string') {
      return NextResponse.json({ success: false, error: { message: 'targetLang is required' } }, { status: 400 });
    }

    const langName = LANGUAGE_NAMES[targetLang] || targetLang;
    const entries = Object.entries(texts).filter(([, v]) => typeof v === 'string' && v.trim().length > 0);

    if (entries.length === 0) {
      return NextResponse.json({ success: true, data: { translations: {}, language: langName } });
    }

    // Initialize LLM SDK
    let zai: any;
    try {
      zai = await ZAI.create();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Translation service is currently unavailable. Please try again later.' } },
        { status: 503 }
      );
    }

    // Build translation prompt
    const inputObj: Record<string, string> = {};
    for (const [k, v] of entries) {
      inputObj[k] = v;
    }

    const messages = [
      {
        role: 'system' as const,
        content: `You are a professional translator for a hotel WiFi captive portal. Translate the following portal texts from ${sourceLang} to ${langName}.
Rules:
- Keep the tone welcoming and professional for hotel guests
- Preserve any placeholder syntax like {variable} exactly
- Keep brand names, URLs, and hotel-specific terms unchanged
- Return ONLY a valid JSON object with the same keys as input and translated values
- No markdown fences, no explanation, no commentary`,
      },
      {
        role: 'user' as const,
        content: JSON.stringify(inputObj),
      },
    ];

    let response: string | null = null;
    try {
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      });
      response = completion.choices[0]?.message?.content || null;
    } catch (err: any) {
      console.error('[Auto-Translate] LLM call failed:', err?.message || String(err));
      return NextResponse.json(
        { success: false, error: { message: 'Translation request failed. Please try again.' } },
        { status: 503 }
      );
    }

    if (!response) {
      return NextResponse.json(
        { success: false, error: { message: 'No translation response received. Please try again.' } },
        { status: 503 }
      );
    }

    // Parse the JSON response
    let translated: Record<string, string> = {};
    try {
      let clean = response.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      translated = JSON.parse(clean);
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          translated = JSON.parse(jsonMatch[0]);
        } catch {
          return NextResponse.json(
            { success: false, error: { message: 'Failed to parse translation response. Please try again.' } },
            { status: 502 }
          );
        }
      } else {
        return NextResponse.json(
          { success: false, error: { message: 'Failed to parse translation response. Please try again.' } },
          { status: 502 }
        );
      }
    }

    // Return only the keys that were in the original request
    const result: Record<string, string> = {};
    for (const [key] of entries) {
      if (typeof translated[key] === 'string') {
        result[key] = translated[key];
      }
    }

    logWifi(request, 'update', 'portal_page', undefined).catch(() => {});
    return NextResponse.json({ success: true, data: { translations: result, language: langName } });
  } catch (error: any) {
    if (error?.message?.includes('Permission') || error?.message?.includes('Unauthorized') || error?.statusCode === 401 || error?.statusCode === 403) {
      return NextResponse.json({ success: false, error: { message: 'Unauthorized' } }, { status: 401 });
    }
    console.error('[Auto-Translate] POST error:', error);
    return NextResponse.json({ success: false, error: { message: 'Internal server error' } }, { status: 500 });
  }
}