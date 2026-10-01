import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for wttr.in weather data.
 *
 * The captive portal blocks all external internet access for unauthenticated
 * guests, so the client-side WeatherWidget cannot fetch from wttr.in directly.
 * This API route runs server-side (which HAS internet access) and proxies
 * the weather data back to the portal client.
 *
 * Response is cached in-memory for 10 minutes to avoid hammering wttr.in.
 */

const weatherCache = new Map<string, { data: string; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  const location = request.nextUrl.searchParams.get('location');
  if (!location || location.trim().length === 0) {
    return NextResponse.json({ temp: '--°', condition: 'Unknown' });
  }

  const normalizedLocation = location.trim();

  // Check cache
  const cached = weatherCache.get(normalizedLocation);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(
      JSON.parse(cached.data),
      { headers: { 'Cache-Control': 'public, max-age=600' } }
    );
  }

  try {
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(normalizedLocation)}?format=%t+%C`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'StaySuite/1.0' },
      }
    );

    if (!res.ok) throw new Error(`wttr.in returned ${res.status}`);

    const text = await res.text();
    const trimmed = text.trim();
    const parts = trimmed.split(/\s+/);
    const data = { temp: parts[0] || '--°', condition: parts.slice(1).join(' ') || 'Clear' };

    // Update cache
    weatherCache.set(normalizedLocation, { data: JSON.stringify(data), fetchedAt: Date.now() });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=600' },
    });
  } catch (err) {
    // Return fallback
    const fallback = { temp: '--°', condition: normalizedLocation };
    return NextResponse.json(fallback);
  }
}
