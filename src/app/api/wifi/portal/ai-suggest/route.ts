import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { requirePermission } from '@/lib/auth/tenant-context';
import { logWifi } from '@/lib/audit';

/**
 * AI Design Suggest API — Feature #15
 *
 * POST /api/wifi/portal/ai-suggest
 * Body: { hotelName, hotelType, brandColor, accentColor }
 * Returns: Design settings suggestion from LLM
 */

const HOTEL_TYPE_STYLES: Record<string, string> = {
  luxury: 'elegant, serif headings, glass form style, warm gold accents, minimal animations, premium feel',
  resort: 'tropical, rounded forms, vibrant gradients, playful, warm colors, resort lifestyle imagery',
  business: 'clean, professional, centered layout, corporate feel, subtle shadows, neutral colors',
  budget: 'simple, compact, centered layout, minimal design, clear CTAs, fast-loading feel',
  hostel: 'friendly, colorful, modern sans-serif, pill buttons, social feel, energetic',
  boutique: 'unique, artistic, asymmetric layouts, distinctive fonts, curated color palette, artisan feel',
};

export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { hotelName, hotelType, brandColor, accentColor } = body as {
      hotelName: string;
      hotelType: string;
      brandColor: string;
      accentColor: string;
    };

    if (!hotelName || !hotelType) {
      return NextResponse.json({ success: false, error: 'hotelName and hotelType are required' }, { status: 400 });
    }

    // Initialize LLM SDK
    let zai: any;
    try {
      zai = await ZAI.create();
    } catch {
      return NextResponse.json(
        { success: false, error: 'AI service is currently unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    const styleGuide = HOTEL_TYPE_STYLES[hotelType] || HOTEL_TYPE_STYLES['business'];

    const prompt = `You are a hospitality WiFi portal designer. Given hotel name "${hotelName}" (type: ${hotelType}), brand color ${brandColor}, accent color ${accentColor}, suggest optimal portal design settings.

Style guide for ${hotelType}: ${styleGuide}

Available layoutType values: centered, split_left, split_right, card, full_bleed, hero_banner, side_panel, bottom_sheet
Available fontFamily values: Inter, Montserrat, Playfair Display, Lora, Poppins, Raleway, Nunito, Roboto, Open Sans, Oswald
Available headingFontFamily values: Inter, Montserrat, Playfair Display, Lora, Poppins, Raleway, Nunito, Roboto, Open Sans, Oswald
Available formStyle values: rounded, square, glass, pill, minimal
Available inputStyle values: rounded, square, pill, underline
Available buttonStyle values: filled, outlined, gradient, pill, rounded
Available buttonSize values: small, medium, large
Available cardShadow values: none, small, medium, large
Available animationType values: none, fade, slide_up, zoom
Available backgroundType values: solid, gradient, image

Return ONLY a JSON object (no markdown, no code fences) with these exact keys:
- layoutType (string)
- fontFamily (string)
- headingFontFamily (string)
- formStyle (string)
- inputStyle (string)
- buttonStyle (string)
- buttonSize (string)
- cardShadow (string)
- animationType (string)
- backgroundType (string)
- gradientFrom (hex color, e.g. #1a1a2e)
- gradientTo (hex color, e.g. #16213e)
- welcomeMessage (short, welcoming string, max 60 chars)
- accentColor (hex color derived from the brand/accent colors)

Important: Return ONLY the JSON object, nothing else.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a hospitality WiFi portal designer. Always respond with ONLY valid JSON, no markdown fences or commentary.' },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    });

    let responseText = completion.choices?.[0]?.message?.content || '';
    // Clean up any markdown code fences
    responseText = responseText.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // Parse JSON
    let suggestedSettings;
    try {
      suggestedSettings = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[AI Suggest] Failed to parse LLM response:', responseText);
      return NextResponse.json(
        { success: false, error: 'AI returned an invalid response. Please try again.' },
        { status: 503 }
      );
    }

    // Validate required fields
    const validSettings: Record<string, unknown> = {};
    const allowedKeys = [
      'layoutType', 'fontFamily', 'headingFontFamily', 'formStyle', 'inputStyle',
      'buttonStyle', 'buttonSize', 'cardShadow', 'animationType', 'backgroundType',
      'gradientFrom', 'gradientTo', 'welcomeMessage', 'accentColor',
    ];

    for (const key of allowedKeys) {
      if (suggestedSettings[key] !== undefined) {
        validSettings[key] = suggestedSettings[key];
      }
    }

    return NextResponse.json({
      success: true,
      data: validSettings,
    });
  } catch (err) {
    console.error('[AI Suggest] Error:', err);
    logWifi(request, 'create', 'portal_page', undefined).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'AI service encountered an error. Please try again later.' },
      { status: 503 }
    );
  }
}
