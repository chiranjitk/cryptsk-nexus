import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from '@/lib/subscriber-session'

// ============================================================
// PUT /api/subscriber-auth/profile
// Update subscriber's own profile (contact info only)
// ============================================================

async function getSubscriberId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySubscriberSessionToken(token)
}

export async function PUT(request: NextRequest) {
  try {
    const subscriberId = await getSubscriberId(request)
    if (!subscriberId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { email, phone, altPhone, address, landmark, pincode } = body

    // Validate email format if provided
    if (email !== undefined && email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 })
      }
    }

    // Validate phone format if provided
    if (phone !== undefined && phone !== '') {
      const phoneRegex = /^\+?\d{10,15}$/
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 })
      }
    }

    // Build update data (only include provided fields)
    const updateData: Record<string, string> = {}
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (altPhone !== undefined) updateData.altPhone = altPhone
    if (address !== undefined) updateData.address = address
    if (landmark !== undefined) updateData.landmark = landmark
    if (pincode !== undefined) updateData.pincode = pincode

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
    }

    const updated = await db.subscriber.update({
      where: { id: subscriberId },
      data: updateData,
      select: {
        id: true, code: true, name: true, email: true, phone: true,
        altPhone: true, address: true, landmark: true, pincode: true,
      },
    })

    return NextResponse.json({ success: true, profile: updated })
  } catch (error) {
    console.error('[API] Subscriber profile update error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
