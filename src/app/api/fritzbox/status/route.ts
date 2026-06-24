import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { FritzboxClient } from '@/lib/fritzbox';

export async function GET() {
  try {
    const settings = getSettings();
    if (!settings.fritzboxPassword) {
      return NextResponse.json({ success: false, error: 'Fritzbox nicht konfiguriert' }, { status: 400 });
    }
    if (!settings.childDeviceIPs || settings.childDeviceIPs.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Geräte-IPs konfiguriert' }, { status: 400 });
    }

    const client = new FritzboxClient();
    const hostEntries = await client.checkDevices(settings.childDeviceIPs);

    const devices = hostEntries.map(e => ({
      hostName: e.hostName,
      ipAddress: e.ipAddress,
      wanAccess: e.wanAccess,
      filterProfileID: e.filterProfileID,
      timeUsed: e.timeUsed,
      timeMax: e.timeMax,
    }));

    const profiles = await client.getProfiles();

    return NextResponse.json({ success: true, data: { devices, profiles } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Status abfragen fehlgeschlagen' }, { status: 500 });
  }
}
