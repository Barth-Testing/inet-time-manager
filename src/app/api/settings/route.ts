import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSettings, verifyParentCode, setParentCode } from '@/lib/settings';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const settingsSchema = z.object({
  fritzboxHost: z.string().min(1).optional(),
  fritzboxUsername: z.string().optional(),
  fritzboxPassword: z.string().optional(),
  accessProfileName: z.string().min(1).optional(),
  childDeviceIPs: z.array(z.string()).optional(),
  maxHoursSunThu: z.number().min(0).max(24).optional(),
  maxHoursFriSat: z.number().min(0).max(24).optional(),
  allowedStartSunThu: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  allowedEndSunThu: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  allowedStartFriSat: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  allowedEndFriSat: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  holidayModeStart: z.string().optional(),
  holidayModeEnd: z.string().optional(),
});

export async function GET() {
  try {
    const settings = getSettings();
    // Don't return password
    const { fritzboxPassword, parentCode, ...safeSettings } = settings;
    return NextResponse.json({ success: true, data: safeSettings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = settingsSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid settings' }, { status: 400 });
    }
    
    updateSettings(parsed.data);
    const settings = getSettings();
    const { fritzboxPassword, parentCode, ...safeSettings } = settings;
    
    return NextResponse.json({ success: true, data: safeSettings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
