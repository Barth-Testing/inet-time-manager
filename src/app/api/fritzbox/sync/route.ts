import { NextRequest, NextResponse } from 'next/server';
import { addSyncLog } from '@/lib/db';
import { getSchedule } from '@/lib/schedule';
import { getSettings } from '@/lib/settings';
import { FritzboxClient } from '@/lib/fritzbox';

export async function POST(request: NextRequest) {
  let date = 'unknown';
  try {
    const body = await request.json();
    date = body.date;

    if (!date) {
      return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });
    }

    const settings = getSettings();
    if (!settings.fritzboxPassword) {
      return NextResponse.json({ success: false, error: 'Fritzbox nicht konfiguriert' }, { status: 400 });
    }

    if (!settings.childDeviceIPs || settings.childDeviceIPs.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Geräte-IPs konfiguriert' }, { status: 400 });
    }

    const schedule = getSchedule(date);
    if (!schedule || !schedule.timeWindows || schedule.timeWindows.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Zeitfenster für diesen Tag' }, { status: 404 });
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let isWithinWindow = false;
    for (const w of schedule.timeWindows) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (currentMinutes >= startMin && currentMinutes < endMin) {
        isWithinWindow = true;
        break;
      }
    }

    const client = new FritzboxClient();
    const results = await client.syncDevices(settings.childDeviceIPs, isWithinWindow);

    const allSuccess = results.every(r => r.success);
    const errors = results.filter(r => !r.success).map(r => `${r.ip}: ${r.error}`).join('; ');

    addSyncLog({
      scheduleDate: date,
      success: allSuccess ? 1 : 0,
      errorMessage: allSuccess ? null : errors,
      createdAt: new Date().toISOString(),
    });

    if (!allSuccess) {
      return NextResponse.json({
        success: false,
        error: `Sync fehlgeschlagen für: ${errors}`,
        results
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        action: isWithinWindow ? 'granted' : 'denied',
        devices: results,
      }
    });
  } catch (error: any) {
    addSyncLog({
      scheduleDate: date,
      success: 0,
      errorMessage: error.message || 'Unknown error',
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: false, error: error.message || 'Sync failed' }, { status: 500 });
  }
}
