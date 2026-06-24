import { getSettings } from './settings';

function createDependencies() {
  const req = require('request');
  const { parseStringPromise } = require('xml2js');
  const xmlbuilder = require('xmlbuilder');
  return { request: req, parseStringPromise, xmlbuilder };
}

function buildSoapMessage(action: string, serviceType: string, vars: Record<string, string>): string {
  const { xmlbuilder } = createDependencies();
  const fqaction = 'u:' + action;
  const root: any = {
    's:Envelope': {
      '@s:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
      '@xmlns:s': 'http://schemas.xmlsoap.org/soap/envelope/',
      's:Body': {}
    }
  };
  root['s:Envelope']['s:Body'][fqaction] = { '@xmlns:u': serviceType };
  Object.assign(root['s:Envelope']['s:Body'][fqaction], vars);
  return xmlbuilder.create(root).end();
}

export interface HostEntry {
  hostName: string;
  ipAddress: string;
  filterProfileID: string;
  timeUsed: number;
  timeMax: number;
  ticketsInAdvance: number;
  ticketValid: number;
  wanAccess: string;
}

export interface FilterProfile {
  id: string;
  name: string;
  timeBudgetSeconds: number;
}

const HOSTFILTER_SERVICE = 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1';
const HOSTFILTER_CONTROL = '/upnp/control/x_hostfilter';

function cleanArgs(obj: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

async function soapCall(
  host: string, port: number, user: string, password: string,
  action: string, vars: Record<string, any> = {}
): Promise<any> {
  const { request, parseStringPromise } = createDependencies();
  const body = buildSoapMessage(action, HOSTFILTER_SERVICE, cleanArgs(vars));

  return new Promise((resolve, reject) => {
    const uri = `http://${host}:${port}${HOSTFILTER_CONTROL}`;
    request({
      method: 'POST',
      uri,
      auth: { user, pass: password, sendImmediately: false },
      rejectUnauthorized: false,
      headers: {
        'SoapAction': `${HOSTFILTER_SERVICE}#${action}`,
        'Content-Type': 'text/xml; charset="utf-8"',
      },
      body,
      timeout: 15000,
    }, async (error: any, response: any, body: string) => {
      if (error) { reject(new Error(`HTTP request failed: ${error.message}`)); return; }
      if (response.statusCode !== 200) {
        try {
          const parsed = await parseStringPromise(body, { explicitArray: false });
          const fault = parsed?.['s:Envelope']?.['s:Body']?.['s:Fault'];
          const code = fault?.detail?.UPnPError?.errorCode || '';
          const desc = fault?.detail?.UPnPError?.errorDescription || response.statusMessage;
          reject(new Error(`SOAP error ${code}: ${desc}`));
        } catch { reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`)); }
        return;
      }
      try {
        const result = await parseStringPromise(body, { explicitArray: false });
        const env = result?.['s:Envelope'];
        const bodyObj = env?.['s:Body'];
        const responseKey = `u:${action}Response`;
        resolve(bodyObj?.[responseKey] || {});
      } catch (e: any) { reject(new Error(`XML parse error: ${e.message}`)); }
    });
  });
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
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor() {
    const settings = getSettings();
    this.host = settings.fritzboxHost || 'fritz.box';
    this.port = 49000;
    this.username = settings.fritzboxUsername || '';
    this.password = settings.fritzboxPassword || '';
  }

  async testConnection(): Promise<{ success: boolean; profiles?: FilterProfile[]; error?: string }> {
    try {
      const result = await soapCall(this.host, this.port, this.username, this.password, 'GetFilterProfiles', {});
      const xml = String(result?.NewFilterProfileList || '');
      const profiles = parseProfileListXml(xml);
      return { success: true, profiles };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getProfiles(): Promise<FilterProfile[]> {
    const result = await soapCall(this.host, this.port, this.username, this.password, 'GetFilterProfiles', {});
    const xml = String(result?.NewFilterProfileList || '');
    return parseProfileListXml(xml);
  }

  async getHostEntry(ip: string): Promise<HostEntry | null> {
    try {
      const result = await soapCall(this.host, this.port, this.username, this.password, 'GetHostEntryByIP', {
        NewIPv4Address: ip,
      });
      return {
        hostName: String(result?.NewHostName || ''),
        ipAddress: ip,
        filterProfileID: String(result?.NewFilterProfileID || ''),
        timeUsed: num(result?.NewTimeUsed),
        timeMax: num(result?.NewTimeMax),
        ticketsInAdvance: num(result?.NewTicketsInAdvance),
        ticketValid: num(result?.NewTicketValid),
        wanAccess: String(result?.NewWANAccess || 'unknown'),
      };
    } catch { return null; }
  }

  async setWANAccess(ip: string, allow: boolean): Promise<void> {
    await soapCall(this.host, this.port, this.username, this.password, 'DisallowWANAccessByIP', {
      NewIPv4Address: ip,
      NewDisallow: allow ? '0' : '1',
    });
  }

  async addTicketTime(ip: string): Promise<{ timeUsed: number; timeMax: number; ticketsInAdvance: number } | null> {
    try {
      const result = await soapCall(this.host, this.port, this.username, this.password, 'AddTicketTimeToHostEntryByIP', {
        NewIPv4Address: ip,
      });
      return {
        timeUsed: num(result?.NewTimeUsed),
        timeMax: num(result?.NewTimeMax),
        ticketsInAdvance: num(result?.NewTicketsInAdvance),
      };
    } catch { return null; }
  }

  async syncDevices(deviceIPs: string[], shouldHaveAccess: boolean): Promise<{ ip: string; success: boolean; error?: string }[]> {
    const results: { ip: string; success: boolean; error?: string }[] = [];
    for (const ip of deviceIPs) {
      try {
        await this.setWANAccess(ip, shouldHaveAccess);
        results.push({ ip, success: true });
      } catch (e: any) {
        results.push({ ip, success: false, error: e.message });
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
