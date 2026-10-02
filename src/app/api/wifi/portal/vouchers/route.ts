import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

// GET /api/wifi/portal/vouchers - Get guest WiFi credentials for voucher printing
// Returns today's check-ins with their WiFi usernames/passwords
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const date = searchParams.get('date'); // YYYY-MM-DD format, defaults to today

    // Default to today
    const targetDate = date
      ? new Date(date + 'T00:00:00.000Z')
      : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build where clause
    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      status: 'checked_in',
      checkIn: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (partnerId && partnerId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      where.partnerId = partnerId;
    }

    // Fetch bookings with guest info, room, and WiFi user
    const bookings = await db.booking.findMany({
      where,
      include: {
        primaryGuest: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        room: {
          select: { id: true, number: true, name: true },
        },
        roomType: {
          select: { id: true, name: true },
        },
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: { checkIn: 'asc' },
    });

    // For each booking, find the WiFi user credentials
    const vouchers = await Promise.all(
      bookings.map(async (booking) => {
        // Find WiFi user linked to this booking
        const wifiUser = await db.wiFiUser.findFirst({
          where: {
            bookingId: booking.id,
            status: { in: ['active', 'pending'] },
          },
          select: {
            id: true,
            username: true,
            password: true,
            validFrom: true,
            validUntil: true,
            status: true,
          },
        });

        return {
          bookingId: booking.id,
          guestName: `${booking.primaryGuest.firstName} ${booking.primaryGuest.lastName}`.trim(),
          guestEmail: booking.primaryGuest.email,
          guestPhone: booking.primaryGuest.phone,
          roomNumber: booking.room?.number || 'TBD',
          roomName: booking.room?.name || '',
          roomType: booking.roomType?.name || '',
          propertyName: booking.partner?.name || '',
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          wifiUsername: wifiUser?.username || null,
          wifiPassword: wifiUser?.password || null,
          wifiValidUntil: wifiUser?.validUntil || null,
          wifiStatus: wifiUser?.status || 'not_provisioned',
          printed: false, // Could be tracked via a separate table later
        };
      })
    );

    // Filter to only guests with WiFi credentials
    const withCredentials = vouchers.filter((v) => v.wifiUsername && v.wifiPassword);

    return NextResponse.json({
      success: true,
      data: {
        vouchers: vouchers,
        total: vouchers.length,
        withCredentials: withCredentials.length,
        withoutCredentials: vouchers.length - withCredentials.length,
        date: targetDate.toISOString().split('T')[0],
        propertyName: vouchers[0]?.propertyName || user.propertyName || 'StaySuite Hotel',
      },
    });
  } catch (error) {
    console.error('Error fetching voucher data:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch voucher data' } },
      { status: 500 }
    );
  }
}
