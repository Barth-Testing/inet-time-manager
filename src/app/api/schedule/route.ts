import { NextRequest, NextResponse } from 'next/server';
import { getSchedule, getSchedulesForWeek, saveSchedule, deleteSchedule } from '@/lib/schedule';
import { getSettings, verifyParentCode } from '@/lib/settings';
import { validateDailySchedule } from '@/lib/validation';
import { z } from 'zod';

const timeWindowSchema = z.object({
  start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
});

const scheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindows: z.array(timeWindowSchema).min(1),
  isHolidayMode: z.boolean().optional().default(false),
  parentCode: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const week = searchParams.get('week');
    
    if (date) {
      const schedule = getSchedule(date);
      return NextResponse.json({ success: true, data: schedule });
    }
    
    if (week) {
      const schedules = getSchedulesForWeek(week);
      return NextResponse.json({ success: true, data: schedules });
    }
    
    return NextResponse.json({ success: false, error: 'Provide date or week parameter' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to load schedule' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = scheduleSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Ungültige Eingabe', details: parsed.error.issues }, { status: 400 });
    }
    
    const schedule = {
      date: parsed.data.date,
      timeWindows: parsed.data.timeWindows,
      isHolidayMode: parsed.data.isHolidayMode,
      parentCodeUsed: false,
    };
    
    const settings = getSettings();
    
    // If holiday mode or needs parent override, verify code
    if (parsed.data.isHolidayMode) {
      if (!parsed.data.parentCode || !verifyParentCode(parsed.data.parentCode)) {
        return NextResponse.json({ success: false, error: 'Eltern-Code erforderlich für Ferienmodus' }, { status: 403 });
      }
      schedule.parentCodeUsed = true;
    }
    
    // Validate the schedule
    const validation = validateDailySchedule(schedule, settings);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.errors.join('; '),
        warnings: validation.warnings,
      }, { status: 400 });
    }
    
    saveSchedule(schedule);
    
    return NextResponse.json({
      success: true,
      data: schedule,
      warnings: validation.warnings,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Fehler beim Speichern' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    if (!date) {
      return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });
    }
    
    deleteSchedule(date);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to delete schedule' }, { status: 500 });
  }
}
