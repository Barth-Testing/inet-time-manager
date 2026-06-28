import { format } from 'date-fns';
import { getSettings } from './settings';
import { getSchedule } from './schedule';
import { FritzboxClient } from './fritzbox';
import { addSyncLog } from './db';

let running = false;
let lastSyncResult: SyncStatus = 'idle';
let lastSyncTime: string | null = null;
let lastSyncDetail: string | null = null;

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function getSyncStatus() {
  return { status: lastSyncResult, lastSync: lastSyncTime, detail: lastSyncDetail };
}

export function startSyncLoop() {
  if (running) return;
  running = true;

  console.log('[SyncLoop] Started, running initial sync...');
  doSync().catch(() => {});

  function tick() {
    doSync().catch(() => {});
    setTimeout(tick, 60_000);
  }

  const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(tick, msToNextMinute);
}

export async function triggerSync(): Promise<SyncStatus> {
  return doSync();
}

async function doSync(): Promise<SyncStatus> {
  lastSyncResult = 'syncing';
  const settings = getSettings();
  if (!settings.fritzboxPassword || !settings.childDeviceIPs.length) {
    lastSyncResult = 'idle';
    return 'idle';
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const schedule = getSchedule(today);
  if (!schedule?.timeWindows?.length) {
    lastSyncResult = 'idle';
    return 'idle';
  }

  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  let shouldHaveAccess = false;
  for (const w of schedule.timeWindows) {
    const [sh, sm] = w.start.split(':').map(Number);
    const [eh, em] = w.end.split(':').map(Number);
    if (currentMin >= sh * 60 + sm && currentMin < eh * 60 + em) {
      shouldHaveAccess = true;
      break;
    }
  }

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
      console.error('[SyncLoop] Sync errors:', errors);
      addSyncLog({ scheduleDate: today, success: 0, errorMessage: errors, createdAt: new Date().toISOString() });
      return 'error';
    }

    if (!allVerified) {
      lastSyncDetail = `Nicht verifiziert: ${notVerified.join(', ')} (Status evtl. nicht aktualisiert)`;
      console.warn('[SyncLoop] Some devices not verified:', notVerified.join(', '));
    } else {
      lastSyncDetail = `Geräte ${shouldHaveAccess ? 'freigegeben' : 'gesperrt'} (${results.length} Geräte)`;
    }

    lastSyncResult = 'success';
    lastSyncTime = format(now, 'HH:mm:ss');
    addSyncLog({ scheduleDate: today, success: 1, errorMessage: null, createdAt: new Date().toISOString() });
    return 'success';
  } catch (e: any) {
    lastSyncResult = 'error';
    lastSyncDetail = e.message;
    console.error('[SyncLoop] Sync failed:', e.message);
    addSyncLog({ scheduleDate: today, success: 0, errorMessage: e.message, createdAt: new Date().toISOString() });
    return 'error';
  }
}
