import { NextRequest, NextResponse } from 'next/server';
import { getSyncLogs } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const logs = getSyncLogs(date || undefined);
    
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load sync log' }, { status: 500 });
  }
}
