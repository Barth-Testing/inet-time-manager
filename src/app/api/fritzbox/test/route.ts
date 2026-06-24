import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { FritzboxClient } from '@/lib/fritzbox';

export async function POST() {
  try {
    const settings = getSettings();
    if (!settings.fritzboxPassword) {
      return NextResponse.json({ success: false, error: 'Fritzbox nicht konfiguriert' }, { status: 400 });
    }

    const client = new FritzboxClient();
    const result = await client.testConnection();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Verbindung erfolgreich',
        data: { availableProfiles: result.profiles?.map(p => `${p.name} (${p.id})`) || [] }
      });
    }

    return NextResponse.json({ success: false, error: result.error || 'Keine Verbindung zur Fritzbox' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Connection failed' }, { status: 500 });
  }
}
