import { getSettings } from './settings';

let fbInstance: any = null;
let fbService: any = null;
let lastDeviceInit = 0;
const DEVICE_REFRESH_MS = 300_000;

let syncLoopStarted = false;

async function getFritzboxService() {
  if (!syncLoopStarted && typeof window === 'undefined') {
    syncLoopStarted = true;
    const { startSyncLoop } = require('./syncLoop');
    startSyncLoop();
  }

  const settings = getSettings();
  if (!settings.fritzboxPassword) throw new Error('Fritzbox nicht konfiguriert');

  const { Fritzbox } = require('fritzbox');

  const needsInit = !fbInstance || !fbService || Date.now() - lastDeviceInit > DEVICE_REFRESH_MS;

  if (needsInit) {
    try {
      fbInstance = new Fritzbox({
        host: settings.fritzboxHost || 'fritz.box',
        port: 49000,
        ssl: false,
        user: settings.fritzboxUsername || '',
        password: settings.fritzboxPassword,
      });
      await fbInstance.initTR064Device();
      fbService = fbInstance.services['urn:dslforum-org:service:X_AVM-DE_HostFilter:1'];
      lastDeviceInit = Date.now();
    } catch (e: any) {
      // Reset cache on failure so next call retries
      fbInstance = null;
      fbService = null;
      throw new Error(`Fritzbox-Init fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'} (${e?.code || e?.name || '?'})`);
    }
  }

  if (!fbService) throw new Error('HostFilter-Service nicht gefunden');
  return fbService;
}

export interface HostEntry {
  hostName: string;
  ipAddress: string;
  filterProfileID: string;
  wanAccess: string;
  disallow: string;
  timeUsed: number;
  timeMax: number;
}

export interface FilterProfile {
  id: string;
  name: string;
  timeBudgetSeconds: number;
}

function num(val: any): number {
  const n = parseInt(String(val ?? '0'), 10);
  return isNaN(n) ? 0 : n;
}

function extractTextBetween(str: string, tag: string): string {
  const startTag = `<${tag}>`;
  const endTag = `</${tag}>`;
  const startIdx = str.indexOf(startTag);
  if (startIdx === -1) return '';
  const contentStart = startIdx + startTag.length;
  const endIdx = str.indexOf(endTag, contentStart);
  if (endIdx === -1) return '';
  return str.substring(contentStart, endIdx);
}

function parseProfileListXml(xml: string): FilterProfile[] {
  if (!xml || xml.trim().length === 0) return [];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const profiles: FilterProfile[] = [];
  let searchFrom = 0;
  while (true) {
    const startIdx = xml.indexOf('<FilterProfile>', searchFrom);
    if (startIdx === -1) break;
    const endIdx = xml.indexOf('</FilterProfile>', startIdx);
    if (endIdx === -1) break;
    const item = xml.substring(startIdx + 15, endIdx);
    const id = extractTextBetween(item, 'FilterProfileID');
    const name = extractTextBetween(item, 'Name');
    const budgets = DAYS.map(d => num(extractTextBetween(item, d)));
    profiles.push({
      id: id || '',
      name: name || '',
      timeBudgetSeconds: Math.max(...budgets, 0),
    });
    searchFrom = endIdx + 16;
  }
  return profiles;
}

export class FritzboxClient {
  async testConnection(): Promise<{ success: boolean; profiles?: FilterProfile[]; error?: string }> {
    try {
      const svc = await getFritzboxService();
      const result = await svc.actions.GetFilterProfiles({});
      const xml = String(result?.NewFilterProfileList || '');
      const profiles = parseProfileListXml(xml);
      return { success: true, profiles };
    } catch (e: any) {
      return { success: false, error: e.message || 'Unbekannter Fehler' };
    }
  }

  async getProfiles(): Promise<FilterProfile[]> {
    const svc = await getFritzboxService();
    const result = await svc.actions.GetFilterProfiles({});
    const xml = String(result?.NewFilterProfileList || '');
    return parseProfileListXml(xml);
  }

  async getHostEntry(ip: string): Promise<HostEntry | null> {
    try {
      const svc = await getFritzboxService();
      const entry = await svc.actions.GetHostEntryByIP({ NewIPv4Address: ip });
      const wanResult = await svc.actions.GetWANAccessByIP({ NewIPv4Address: ip });
      return {
        hostName: String(entry?.NewHostName || ''),
        ipAddress: ip,
        filterProfileID: String(entry?.NewFilterProfileID || ''),
        wanAccess: String(wanResult?.NewWANAccess || 'unknown'),
        disallow: String(wanResult?.NewDisallow || '0'),
        timeUsed: num(entry?.NewTimeUsed),
        timeMax: num(entry?.NewTimeMax),
      };
    } catch { return null; }
  }

  async setWANAccess(ip: string, allow: boolean): Promise<void> {
    const svc = await getFritzboxService();
    const newDisallow = allow ? 0 : 1;
    await svc.actions.DisallowWANAccessByIP({
      NewIPv4Address: ip,
      NewDisallow: newDisallow,
    });
  }

  async setHostEntryFilterProfile(ip: string, profileId: string): Promise<void> {
    const svc = await getFritzboxService();
    await svc.actions.AddHostEntryToFilterProfile({
      NewIPv4Address: ip,
      NewFilterProfileID: profileId,
    });
  }

  async findAllowProfileId(blockProfileName: string): Promise<string | null> {
    try {
      const profiles = await this.getProfiles();
      const blockProfile = profiles.find(p => p.name === blockProfileName);
      const nonBlock = profiles.find(p => p.name !== blockProfileName && p.name === '');
      return nonBlock?.id || null;
    } catch {
      return null;
    }
  }

  async keepAlive(deviceIPs: string[]): Promise<void> {
    try {
      const svc = await getFritzboxService();
      for (const ip of deviceIPs) {
        try {
          await svc.actions.DisallowWANAccessByIP({ NewIPv4Address: ip, NewDisallow: 0 });
        } catch (e: any) {
          console.log(`[KeepAlive] ${ip} failed: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.error(`[KeepAlive] service error: ${e.message}`);
    }
  }

  async syncDevices(
    deviceIPs: string[],
    shouldHaveAccess: boolean
  ): Promise<{ ip: string; success: boolean; verified: boolean; error?: string }[]> {
    const results: { ip: string; success: boolean; verified: boolean; error?: string }[] = [];

    let allowProfileId: string | null = null;
    if (shouldHaveAccess) {
      const settings = getSettings();
      allowProfileId = await this.findAllowProfileId(settings.accessProfileName).catch(() => null);
      console.log(`[Fritzbox] allowProfileId: ${allowProfileId}, blockProfileName: ${settings.accessProfileName}`);
    }

    for (const ip of deviceIPs) {
      try {
        await this.setWANAccess(ip, shouldHaveAccess);

        if (allowProfileId) {
          try {
            await this.setHostEntryFilterProfile(ip, allowProfileId);
            console.log(`[Fritzbox] Profile switch ${ip} -> ${allowProfileId} OK`);
          } catch (e: any) {
            console.log(`[Fritzbox] Profile switch ${ip} -> ${allowProfileId} FAILED: ${e.message}`);
          }
        } else if (!shouldHaveAccess) {
          const settings = getSettings();
          const blockProfile = (await this.getProfiles()).find(p => p.name === settings.accessProfileName);
          if (blockProfile) {
            try {
              await this.setHostEntryFilterProfile(ip, blockProfile.id);
              console.log(`[Fritzbox] Profile switch ${ip} -> ${blockProfile.id} OK`);
            } catch (e: any) {
              console.log(`[Fritzbox] Profile switch ${ip} -> ${blockProfile.id} FAILED: ${e.message}`);
            }
          }
        }

        const entry = await this.getHostEntry(ip);
        const expectedDisallow = shouldHaveAccess ? '0' : '1';
        const verified = entry?.disallow === expectedDisallow;
        results.push({ ip, success: true, verified });
      } catch (e: any) {
        results.push({ ip, success: false, verified: false, error: e.message || 'Unbekannter Fehler beim Sync' });
      }
    }
    return results;
  }

  async checkDevices(deviceIPs: string[]): Promise<HostEntry[]> {
    const entries: HostEntry[] = [];
    for (const ip of deviceIPs) {
      const entry = await this.getHostEntry(ip);
      if (entry) entries.push(entry);
    }
    return entries;
  }
}
