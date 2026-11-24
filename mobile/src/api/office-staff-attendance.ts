import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { reportQuery } from "./office-reports";

/*
 * Reports, Staff attendance (A-239): who came, who was late and who was away,
 * by day, week and month, with the working hours each person is expected to
 * keep. The calls the site's page makes.
 */

export const STAFF_ATTENDANCE_TABS = [
  "daily",
  "weekly",
  "monthly",
  "statistics",
  "schedules",
] as const;
export type StaffAttendanceTab = (typeof STAFF_ATTENDANCE_TABS)[number];

export type DayStatus = "PRESENT" | "LATE" | "ABSENT" | "NOT_WORKING_DAY" | "NO_SCHEDULE";

export interface StaffDayRow {
  userId: string;
  fullName: string;
  branchName: string | null;
  /** Times of day as "09:00", in the centre's time. */
  expectedIn: string | null;
  expectedOut: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  status: DayStatus;
  source: "FACE_ID" | "MANUAL" | null;
}

export interface StaffWeekRow {
  userId: string;
  fullName: string;
  days: Array<{ date: string; status: DayStatus; checkIn: string | null }>;
}

export interface StaffMonthRow {
  userId: string;
  fullName: string;
  branchName: string | null;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  workedMinutes: number;
  lateMinutes: number;
}

export interface WorkDay {
  /** 0 is Sunday, as the server counts. */
  weekday: number;
  start: string;
  end: string;
}

export interface ScheduleRow {
  userId: string;
  fullName: string;
  /** By weekday, 0 (Sunday) to 6; null on a day off. */
  days: Array<WorkDay | null>;
}

export interface StaffAttendanceReport {
  year: number;
  month: number;
  /** The day the Daily and Weekly tabs are of. */
  date: string;
  branchId: string | null;
  kpis: { total: number; cameToday: number; lateToday: number; absentToday: number };
  daily: StaffDayRow[];
  weekly: { from: string; to: string; rows: StaffWeekRow[] };
  monthly: StaffMonthRow[];
  statistics: {
    punctualityRate: number;
    attendanceRate: number;
    avgWorkedMinutes: number;
    byDay: Array<{ date: string; present: number; late: number; absent: number }>;
  };
  schedules: ScheduleRow[];
  lateAfterMinutes: number;
}

export interface StaffAttendanceFilters {
  year: number;
  month: number;
  branchId: string | null;
  /** Null asks for the server's own day: today in this month, its first day in another. */
  date: string | null;
}

const KEY = ["reports", "staff-attendance"] as const;

export function useStaffAttendance(filters: StaffAttendanceFilters) {
  return useQuery({
    queryKey: [...KEY, filters] as const,
    queryFn: ({ signal }) =>
      api<StaffAttendanceReport>(`/reports/staff-attendance${reportQuery({ ...filters })}`, {
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

/** A manager puts in or corrects when someone came and left on a day. */
export function useManualCheck() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      date: string;
      checkIn: string | null;
      checkOut: string | null;
    }) => api<void>("/staff-attendance/manual", { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** Replaces the working week of one person. */
export function useSaveWorkSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; days: WorkDay[] }) =>
      api<void>("/work-schedules", { method: "PUT", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}
