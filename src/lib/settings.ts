import { getSettings as loadStored, setSettings as persistStored, updateSettings as patchStored } from './db';
import { Settings } from '@/types';
import bcrypt from 'bcryptjs';

const DEFAULTS: Settings = {
  fritzboxHost: 'fritz.box',
  fritzboxUsername: '',
  fritzboxPassword: '',
  accessProfileName: 'Kind',
  childDeviceIPs: [],
  parentCode: '',
  maxHoursSunThu: 3,
  maxHoursFriSat: 4.5,
  allowedStartSunThu: '10:00',
  allowedEndSunThu: '21:30',
  allowedStartFriSat: '10:00',
  allowedEndFriSat: '23:30',
};

export function getSettings(): Settings {
  const stored = loadStored();
  if (!stored) return { ...DEFAULTS };
  return {
    fritzboxHost: stored.fritzboxHost || DEFAULTS.fritzboxHost,
    fritzboxUsername: stored.fritzboxUsername || DEFAULTS.fritzboxUsername,
    fritzboxPassword: stored.fritzboxPassword || DEFAULTS.fritzboxPassword,
    accessProfileName: stored.accessProfileName || DEFAULTS.accessProfileName,
    childDeviceIPs: stored.childDeviceIPs || DEFAULTS.childDeviceIPs,
    parentCode: '',
    maxHoursSunThu: stored.maxHoursSunThu ?? DEFAULTS.maxHoursSunThu,
    maxHoursFriSat: stored.maxHoursFriSat ?? DEFAULTS.maxHoursFriSat,
    allowedStartSunThu: stored.allowedStartSunThu || DEFAULTS.allowedStartSunThu,
    allowedEndSunThu: stored.allowedEndSunThu || DEFAULTS.allowedEndSunThu,
    allowedStartFriSat: stored.allowedStartFriSat || DEFAULTS.allowedStartFriSat,
    allowedEndFriSat: stored.allowedEndFriSat || DEFAULTS.allowedEndFriSat,
  };
}

export function updateSettings(partial: Partial<Settings>): void {
  patchStored(partial as any);
}

export function verifyParentCode(code: string): boolean {
  const stored = loadStored();
  if (!stored || !stored.parentCodeHash) return false;
  return bcrypt.compareSync(code, stored.parentCodeHash);
}

export function setParentCode(code: string): void {
  const hash = bcrypt.hashSync(code, 10);
  patchStored({ parentCodeHash: hash } as any);
}
