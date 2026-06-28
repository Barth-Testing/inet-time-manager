import { NextResponse } from 'next/server';
import { getSyncStatus } from '@/lib/syncLoop';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = getSyncStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
