import { NextRequest, NextResponse } from 'next/server';
import { verifyParentCode, setParentCode } from '@/lib/settings';
import { z } from 'zod';

const verifySchema = z.object({
  code: z.string().min(1),
});

const setCodeSchema = z.object({
  currentCode: z.string().min(1),
  newCode: z.string().min(4).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifySchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Code required' }, { status: 400 });
    }
    
    const valid = verifyParentCode(parsed.data.code);
    
    if (valid) {
      const token = Buffer.from(`parent:${Date.now()}`).toString('base64');
      return NextResponse.json({ success: true, token });
    }
    
    return NextResponse.json({ success: false, error: 'Ungültiger Code' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setCodeSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    
    if (!verifyParentCode(parsed.data.currentCode)) {
      return NextResponse.json({ success: false, error: 'Aktueller Code falsch' }, { status: 401 });
    }
    
    setParentCode(parsed.data.newCode);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to change code' }, { status: 500 });
  }
}
