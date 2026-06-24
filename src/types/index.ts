export interface TimeWindow {
  start: string; // HH:mm format
  end: string;   // HH:mm format
}

export interface DailySchedule {
  date: string; // YYYY-MM-DD
  timeWindows: TimeWindow[];
  isHolidayMode: boolean;
  parentCodeUsed: boolean;
}

export interface WeekSchedule {
  [date: string]: DailySchedule;
}

export interface Settings {
  fritzboxHost: string;
  fritzboxUsername: string;
  fritzboxPassword: string;
  accessProfileName: string;
  childDeviceIPs: string[];
  parentCode: string;
  maxHoursSunThu: number;
  maxHoursFriSat: number;
  allowedStartSunThu: string;
  allowedEndSunThu: string;
  allowedStartFriSat: string;
  allowedEndFriSat: string;
  holidayModeStart: string;
  holidayModeEnd: string;
}

export interface FritzboxProfile {
  id: string;
  name: string;
  timeBudgetSeconds: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
