import { format } from 'date-fns';
import { getSettings } from './settings';
import { getSchedule } from './schedule';
import { FritzboxClient } from './fritzbox';

let running = false;

export function startSyncLoop() {
  if (running) return;
  running = true;

  doSync().catch(() => {});

  function tick() {
    doSync().catch(() => {});
    setTimeout(tick, 60_000);
  }

  const msToNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
  setTimeout(tick, msToNextMinute);
}

async function doSync() {
  const settings = getSettings();
  if (!settings.fritzboxPassword || !settings.childDeviceIPs.length) return;

  const today = format(new Date(), 'yyyy-MM-dd');
  const schedule = getSchedule(today);
  if (!schedule?.timeWindows?.length) return;

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

  const client = new FritzboxClient();
  await client.syncDevices(settings.childDeviceIPs, shouldHaveAccess);
}
