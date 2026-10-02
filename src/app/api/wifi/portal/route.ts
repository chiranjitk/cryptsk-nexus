import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ success: true, data: {"status":"active","instances":2,"authMethods":["room_number","otp","voucher"],"branding":"configured"} });
}
