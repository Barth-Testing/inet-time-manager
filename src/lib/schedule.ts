import {
  getSchedule as loadSchedule,
  getSchedulesForWeek as loadWeek,
  saveSchedule as persistSchedule,
  deleteSchedule as removeSchedule,
} from './db';
import { DailySchedule, TimeWindow } from '@/types';

export function getSchedule(date: string): DailySchedule | null {
  const stored = loadSchedule(date);
  if (!stored) return null;
  return {
    date: stored.date,
    timeWindows: JSON.parse(stored.timeWindows),
    isHolidayMode: Boolean(stored.isHolidayMode),
    parentCodeUsed: Boolean(stored.parentCodeUsed),
  };
}

export function getSchedulesForWeek(startDate: string): DailySchedule[] {
  return loadWeek(startDate).map(s => ({
    date: s.date,
    timeWindows: JSON.parse(s.timeWindows),
    isHolidayMode: Boolean(s.isHolidayMode),
    parentCodeUsed: Boolean(s.parentCodeUsed),
  }));
}

export function saveSchedule(schedule: DailySchedule): void {
  persistSchedule({
    date: schedule.date,
    timeWindows: JSON.stringify(schedule.timeWindows),
    isHolidayMode: schedule.isHolidayMode ? 1 : 0,
    parentCodeUsed: schedule.parentCodeUsed ? 1 : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function deleteSchedule(date: string): void {
  removeSchedule(date);
}

export function calculateTotalMinutes(windows: TimeWindow[]): number {
  let total = 0;
  for (const w of windows) {
    const start = w.start.split(':').map(Number);
    const end = w.end.split(':').map(Number);
    const startMin = start[0] * 60 + start[1];
    const endMin = end[0] * 60 + end[1];
    total += endMin - startMin;
  }
  return total;
}

export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}
