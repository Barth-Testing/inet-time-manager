import { format, addDays } from 'date-fns';
import { getSettings } from './settings';
import { getSchedule } from './schedule';
import { FritzboxClient } from './fritzbox';
import { addSyncLog } from './db';

let started = false;
let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncResult: SyncStatus = 'idle';
let lastSyncTime: string | null = null;
let lastSyncDetail: string | null = null;

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function getSyncStatus() {
  return { status: lastSyncResult, lastSync: lastSyncTime, detail: lastSyncDetail };
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isInsideWindow(windows: { start: string; end: string }[], nowMin: number): boolean {
  for (const w of windows) {
    if (nowMin >= timeToMin(w.start) && nowMin < timeToMin(w.end)) return true;
  }
  return false;
}

function nextTransitionMin(windows: { start: string; end: string }[], nowMin: number): number | null {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));

  for (const w of sorted) {
    const s = timeToMin(w.start);
    const e = timeToMin(w.end);
    if (nowMin >= s && nowMin < e) return e;
  }

  for (const w of sorted) {
    const s = timeToMin(w.start);
    if (nowMin < s) return s;
  }

  return null;
}

function msUntil(targetMin: number): number {
  const now = new Date();
  const diffMin = targetMin - (now.getHours() * 60 + now.getMinutes());
  if (diffMin <= 0) return 0;
  return diffMin * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

function clearTimers() {
  if (boundaryTimer) { clearTimeout(boundaryTimer); boundaryTimer = null; }
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

async function syncDevices(shouldHaveAccess: boolean) {
  const settings = getSettings();
  if (!settings.fritzboxPassword || !settings.childDeviceIPs.length) return;

  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');

  try {
    const client = new FritzboxClient();
    await client.syncDevices(settings.childDeviceIPs, shouldHaveAccess);

    lastSyncResult = 'success';
    lastSyncTime = format(now, 'HH:mm:ss');
    lastSyncDetail = shouldHaveAccess ? 'Geräte freigegeben' : 'Geräte gesperrt';
    addSyncLog({ scheduleDate: today, success: 1, errorMessage: null, createdAt: now.toISOString() });
    console.log(`[SyncLoop] ${lastSyncDetail} um ${lastSyncTime}`);
  } catch (e: any) {
    lastSyncResult = 'error';
    lastSyncDetail = `Sync fehlgeschlagen: ${e.message}`;
    console.error('[SyncLoop]', e.message);
    addSyncLog({ scheduleDate: today, success: 0, errorMessage: e.message, createdAt: now.toISOString() });
  }
}

function scheduleBoundary() {
  if (boundaryTimer) { clearTimeout(boundaryTimer); boundaryTimer = null; }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = format(now, 'yyyy-MM-dd');
  const schedule = getSchedule(today);

  const windows = schedule?.timeWindows;
  if (!windows?.length) { console.log('[Timer] no windows, midnight'); scheduleMidnight(); return; }

  const nextMin = nextTransitionMin(windows, nowMin);
  if (nextMin === null) { console.log('[Timer] no next transition, midnight'); scheduleMidnight(); return; }

  const delay = msUntil(nextMin);
  const hh = String(Math.floor(nextMin / 60)).padStart(2, '0');
  const mm = String(nextMin % 60).padStart(2, '0');
  console.log(`[Timer] next transition at ${hh}:${mm} (in ${Math.round(delay/1000)}s)`);
  boundaryTimer = setTimeout(onTransition, Math.max(delay, 500));
}

function scheduleMidnight() {
  const tomorrow = addDays(new Date(), 1);
  const ms = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).getTime() - Date.now();
  console.log(`[Timer] scheduleMidnight, next in ${Math.round(ms/60000)}min`);
  boundaryTimer = setTimeout(scheduleBoundary, Math.max(ms, 1_000));
}

async function startKeepAlive() {
  const settings = getSettings();
  if (!settings.childDeviceIPs.length) return;
  console.log(`[KeepAlive] Starting (${settings.childDeviceIPs.length} devices, interval=40s)`);
  const client = new FritzboxClient();
  keepAliveTimer = setInterval(async () => {
    for (const ip of settings.childDeviceIPs) {
      try {
        await client.setWANAccess(ip, true);
      } catch (e: any) {
        console.error(`[KeepAlive] ${ip} failed:`, e?.message || String(e).substring(0, 100));
      }
    }
  }, 40_000);
}

async function onTransition() {
  clearTimers();

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = format(now, 'yyyy-MM-dd');
  const schedule = getSchedule(today);
  if (!schedule?.timeWindows?.length) { scheduleBoundary(); return; }

  const inside = isInsideWindow(schedule.timeWindows, nowMin);
  console.log(`[Timer] onTransition at ${format(now, 'HH:mm:ss')}, inside=${inside}`);
  await syncDevices(inside);

  if (inside) await startKeepAlive();
  scheduleBoundary();
}

export function startSyncLoop() {
  if (started) return;
  started = true;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = format(now, 'yyyy-MM-dd');
  const schedule = getSchedule(today);

  if (schedule?.timeWindows?.length) {
    const inside = isInsideWindow(schedule.timeWindows, nowMin);
    syncDevices(inside).then(() => {
      scheduleBoundary();
    });
  } else {
    scheduleBoundary();
  }
}

export async function triggerSync(): Promise<SyncStatus> {
  const settings = getSettings();
  if (!settings.fritzboxPassword || !settings.childDeviceIPs.length) return 'idle';

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = format(now, 'yyyy-MM-dd');
  const schedule = getSchedule(today);
  if (!schedule?.timeWindows?.length) return 'idle';

  const shouldHaveAccess = isInsideWindow(schedule.timeWindows, nowMin);

  try {
    const client = new FritzboxClient();
    const results = await client.syncDevices(settings.childDeviceIPs, shouldHaveAccess);

    const allOk = results.every(r => r.success);
    const allVerified = results.every(r => r.verified);
    const errors = results.filter(r => !r.success).map(r => `${r.ip}: ${r.error}`).join('; ');
    const notVerified = results.filter(r => !r.verified).map(r => r.ip);

    if (!allOk) {
      lastSyncResult = 'error';
      lastSyncDetail = `Fehler: ${errors}`;
      addSyncLog({ scheduleDate: today, success: 0, errorMessage: errors, createdAt: now.toISOString() });
      return 'error';
    }

    lastSyncResult = 'success';
    lastSyncTime = format(now, 'HH:mm:ss');
    lastSyncDetail = shouldHaveAccess ? 'Geräte freigegeben' : 'Geräte gesperrt';
    addSyncLog({ scheduleDate: today, success: 1, errorMessage: null, createdAt: now.toISOString() });

    if (!allVerified) {
      lastSyncDetail += ` (nicht verifiziert: ${notVerified.join(', ')})`;
    }

    return 'success';
  } catch (e: any) {
    lastSyncResult = 'error';
    lastSyncDetail = e.message;
    addSyncLog({ scheduleDate: today, success: 0, errorMessage: e.message, createdAt: now.toISOString() });
    return 'error';
  }
}
