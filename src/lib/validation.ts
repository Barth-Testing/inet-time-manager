import { TimeWindow, DailySchedule, Settings } from '@/types';
import { format, getDay, parseISO } from 'date-fns';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTimeWindow(window: TimeWindow, settings: Settings, date: Date): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  const allowedStart = isWeekend ? settings.allowedStartFriSat : settings.allowedStartSunThu;
  const allowedEnd = isWeekend ? settings.allowedEndFriSat : settings.allowedEndSunThu;
  const maxHours = isWeekend ? settings.maxHoursFriSat : settings.maxHoursSunThu;
  
  // Check if window is within allowed hours
  if (window.start < allowedStart) {
    errors.push(`Startzeit ${window.start} ist vor der erlaubten Zeit ${allowedStart}`);
  }
  
  if (window.end > allowedEnd) {
    errors.push(`Endzeit ${window.end} ist nach der erlaubten Zeit ${allowedEnd}`);
  }
  
  if (window.start >= window.end) {
    errors.push(`Startzeit muss vor Endzeit liegen`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateDailySchedule(schedule: DailySchedule, settings: Settings): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const date = parseISO(schedule.date);
  const dayOfWeek = getDay(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const maxHours = isWeekend ? settings.maxHoursFriSat : settings.maxHoursSunThu;
  const maxMinutes = maxHours * 60;
  
  // Validate each time window
  for (const window of schedule.timeWindows) {
    const result = validateTimeWindow(window, settings, date);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  
  // Check for overlapping windows
  const sortedWindows = [...schedule.timeWindows].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sortedWindows.length - 1; i++) {
    if (sortedWindows[i].end > sortedWindows[i + 1].start) {
      errors.push(`Zeitfenster überschneiden sich: ${sortedWindows[i].end} > ${sortedWindows[i + 1].start}`);
    }
  }
  
  // Check total minutes
  let totalMinutes = 0;
  for (const window of schedule.timeWindows) {
    const start = window.start.split(':').map(Number);
    const end = window.end.split(':').map(Number);
    totalMinutes += (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
  }
  
  if (totalMinutes > maxMinutes) {
    errors.push(`Gesamtzeit ${formatMinutes(totalMinutes)} überschreitet Maximum von ${maxHours}h`);
  } else if (totalMinutes > maxMinutes * 0.9) {
    warnings.push(`Fast das Maximum erreicht: ${formatMinutes(totalMinutes)} von ${maxHours}h`);
  }
  
  // Check minimum window duration (at least 15 minutes)
  for (const window of schedule.timeWindows) {
    const start = window.start.split(':').map(Number);
    const end = window.end.split(':').map(Number);
    const duration = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    if (duration < 15) {
      errors.push(`Zeitfenster ${window.start}-${window.end} ist kürzer als 15 Minuten`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function getAllowedTimeRange(date: Date, settings: Settings, isHolidayMode: boolean = false): { start: string; end: string } {
  const dayOfWeek = getDay(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  if (isHolidayMode) {
    return {
      start: '10:00',
      end: '23:30',
    };
  }
  
  return {
    start: isWeekend ? settings.allowedStartFriSat : settings.allowedStartSunThu,
    end: isWeekend ? settings.allowedEndFriSat : settings.allowedEndSunThu,
  };
}

export function getMaxHours(date: Date, settings: Settings, isHolidayMode: boolean = false): number {
  if (isHolidayMode) return 4.5;
  
  const dayOfWeek = getDay(date);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  return isWeekend ? settings.maxHoursFriSat : settings.maxHoursSunThu;
}
