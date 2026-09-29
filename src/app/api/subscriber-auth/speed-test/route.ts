import { NextRequest, NextResponse } from 'next/server'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// Helper: authenticate subscriber session
async function authenticate(request: NextRequest): Promise<string | NextResponse> {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }
  const subscriberId = await verifySubscriberSessionToken(token)
  if (!subscriberId) {
    return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 })
  }
  return subscriberId
}

// ============================================================
// GET /api/subscriber-auth/speed-test?type=download
// GET /api/subscriber-auth/speed-test?type=ping
// Serves binary payload for download speed test or small payload for ping
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if (typeof auth !== 'string') return auth

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'ping') {
      // Return minimal JSON for latency measurement — include server timestamp
      return NextResponse.json({
        type: 'pong',
        t: Date.now(),
        // Include cache-busting header
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
    }

    if (type === 'download') {
      // Serve binary data for download speed measurement
      // Default 2MB, max 10MB
      const sizeParam = parseInt(searchParams.get('size') || '2097152', 10)
      const size = Math.min(Math.max(sizeParam, 1024), 10 * 1024 * 1024)

      // Generate random buffer (avoid allocUnsafe for safety)
      const buffer = Buffer.alloc(size)
      // Fill with pseudo-random data (faster than Math.random per byte)
      for (let i = 0; i < size; i++) {
        buffer[i] = (Math.random() * 256) | 0
      }

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': size.toString(),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Content-Disposition': 'attachment; filename=speedtest.bin',
        },
      })
    }

    return NextResponse.json({ success: false, error: 'Invalid type. Use ?type=download or ?type=ping' }, { status: 400 })
  } catch (error) {
    console.error('[API] Speed-test GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================
// POST /api/subscriber-auth/speed-test
// Receives binary payload for upload speed test
// Body: raw binary (application/octet-stream)
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if (typeof auth !== 'string') return auth

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/octet-stream')) {
      // Upload speed test: read the full body and acknowledge
      const chunks: Uint8Array[] = []
      let totalBytes = 0

      const reader = request.body?.getReader()
      if (!reader) {
        return NextResponse.json({ success: false, error: 'No body provided' }, { status: 400 })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalBytes += value.length
      }

      return NextResponse.json({
        success: true,
        received: totalBytes,
        t: Date.now(),
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      })
    }

    return NextResponse.json({ success: false, error: 'Expected application/octet-stream content type' }, { status: 400 })
  } catch (error) {
    console.error('[API] Speed-test POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
