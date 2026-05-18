export type AttendanceStatus =
  | "not_recorded"
  | "present"
  | "absent"
  | "excused"
  | "late";

export type AttendanceMoment = "morning" | "afternoon";

export type Attendance = {
  id: string;
  enrollment_id: string;
  period_date: string;
  moment: AttendanceMoment;
  status: AttendanceStatus;
  note: string | null;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  not_recorded: "Non renseigné",
  present: "Présent",
  absent: "Absent",
  excused: "Excusé",
  late: "En retard",
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  not_recorded:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  present:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  absent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  excused:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  late: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export const MOMENT_LABELS: Record<AttendanceMoment, string> = {
  morning: "Matin",
  afternoon: "Après-midi",
};

export const MOMENT_SHORT_LABELS: Record<AttendanceMoment, string> = {
  morning: "Mat.",
  afternoon: "A-M.",
};
