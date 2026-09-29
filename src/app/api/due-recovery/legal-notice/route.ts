import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { invoiceId, subscriberName, subscriberCode, invoiceNumber, balanceAmount, area } = body;
    const isp = await db.ispSettings.findFirst();
    const prefix = isp?.companyName || 'ISP';
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const notice = `[LEGAL NOTICE]\n\nDate: ${date}\nRef: LN-${Date.now().toString(36).toUpperCase()}\n\nTo,\n${subscriberName} (${subscriberCode})\nAddress: ${area || 'N/A'}\n\nSubject: Legal Notice for Outstanding Payment\n\nThis is to inform you that despite repeated reminders, your invoice ${invoiceNumber} with an outstanding balance of Rs. ${balanceAmount} remains unpaid as of today.\n\nWe demand immediate payment within 7 days of receipt of this notice, failing which we shall be constrained to initiate legal proceedings including but not limited to:\n\n1. Filing a suit for recovery of the said amount along with applicable interest.\n2. Suspension of services without further notice.\n3. Reporting to credit bureaus.\n\nThis notice is issued without prejudice to any other rights available under law.\n\nFor payment, contact us at our office or call our customer support.\n\nSd/-\nAuthorized Signatory\n${prefix}`;

    return NextResponse.json({ notice });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
