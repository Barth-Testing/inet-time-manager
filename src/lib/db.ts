import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'app-data.json');

interface StoredSettings {
  fritzboxHost: string;
  fritzboxUsername: string;
  fritzboxPassword: string;
  accessProfileName: string;
  childDeviceIPs: string[];
  parentCodeHash: string;
  maxHoursSunThu: number;
  maxHoursFriSat: number;
  allowedStartSunThu: string;
  allowedEndSunThu: string;
  allowedStartFriSat: string;
  allowedEndFriSat: string;
}

interface StoredSchedule {
  date: string;
  timeWindows: string;
  isHolidayMode: number;
  parentCodeUsed: number;
  createdAt: string;
  updatedAt: string;
}

interface SyncLogEntry {
  id: number;
  scheduleDate: string;
  success: number;
  errorMessage: string | null;
  createdAt: string;
}

interface AppData {
  settings: StoredSettings | null;
  schedules: StoredSchedule[];
  syncLogs: SyncLogEntry[];
}

let data: AppData = { settings: null, schedules: [], syncLogs: [] };

function load(): void {
  try {
    const raw = readFileSync(dbPath, 'utf-8');
    data = JSON.parse(raw);
  } catch {
    data = { settings: null, schedules: [], syncLogs: [] };
  }
}

function save(): void {
  writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

// Initialize
load();

export function getSettings(): StoredSettings | null {
  return data.settings;
}

export function setSettings(settings: StoredSettings): void {
  data.settings = settings;
  save();
}

export function updateSettings(partial: Partial<StoredSettings>): void {
  if (!data.settings) {
    data.settings = partial as StoredSettings;
  } else {
    Object.assign(data.settings, partial);
  }
  save();
}

export function getSchedule(date: string): StoredSchedule | undefined {
  return data.schedules.find(s => s.date === date);
}

export function getSchedulesForWeek(startDate: string): StoredSchedule[] {
  const end = new Date(startDate);
  end.setDate(end.getDate() + 7);
  const endStr = end.toISOString().slice(0, 10);
  return data.schedules.filter(s => s.date >= startDate && s.date < endStr);
}

export function saveSchedule(schedule: StoredSchedule): void {
  const existing = data.schedules.findIndex(s => s.date === schedule.date);
  if (existing >= 0) {
    data.schedules[existing] = schedule;
  } else {
    data.schedules.push(schedule);
  }
  save();
}

export function deleteSchedule(date: string): void {
  data.schedules = data.schedules.filter(s => s.date !== date);
  save();
}

export function addSyncLog(entry: Omit<SyncLogEntry, 'id'>): void {
  const id = data.syncLogs.length > 0 ? Math.max(...data.syncLogs.map(l => l.id)) + 1 : 1;
  data.syncLogs.push({ ...entry, id });
  save();
}

export function getSyncLogs(date?: string): SyncLogEntry[] {
  if (date) {
    return data.syncLogs.filter(l => l.scheduleDate === date).slice(-10);
  }
  return data.syncLogs.slice(-20);
}

// Export a query-compatible interface for existing code
export const db = {
  prepare: (sql: string) => {
    return {
      get: (params?: any) => {
        // Simplified - just return null for schema checks
        return null;
      },
      run: (...params: any[]) => {
        // No-op for schema operations
        return {};
      },
      all: (params?: any) => {
        return [];
      },
    };
  },
  exec: (sql: string) => {
    // No-op for schema operations
  },
};
