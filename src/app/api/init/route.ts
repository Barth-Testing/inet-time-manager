import { NextResponse } from 'next/server';
import { setSettings } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST() {
  try {
    const defaultCode = '1234';
    const hash = bcrypt.hashSync(defaultCode, 10);
    
    setSettings({
      fritzboxHost: 'fritz.box',
      fritzboxUsername: '',
      fritzboxPassword: '',
      accessProfileName: 'Kind',
      parentCodeHash: hash,
      maxHoursSunThu: 3,
      maxHoursFriSat: 4.5,
      allowedStartSunThu: '10:00',
      allowedEndSunThu: '21:30',
      allowedStartFriSat: '10:00',
      allowedEndFriSat: '23:30',
    });

    return NextResponse.json({
      success: true,
      message: 'Datenbank initialisiert',
      defaultCode: '1234',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Init fehlgeschlagen',
    }, { status: 500 });
  }
}
