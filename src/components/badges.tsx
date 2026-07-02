import { cn } from "@/lib/utils";

const pill =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

export type Rating = "excellent" | "good" | "weak";
export type SessionType = "new_memorization" | "review";
export type Gender = "male" | "female";
export type AttendanceStatus = "present" | "absent";

const ratingMap: Record<Rating, { label: string; className: string }> = {
  excellent: { label: "ممتاز", className: "bg-[#dcfce7] text-[#166534]" },
  good: { label: "جيد", className: "bg-[#fef9c3] text-[#854d0e]" },
  weak: { label: "ضعيف", className: "bg-[#fee2e2] text-[#991b1b]" },
};

const sessionTypeMap: Record<
  SessionType,
  { label: string; className: string }
> = {
  new_memorization: { label: "تسميع جديد", className: "bg-[#dbeafe] text-[#1e40af]" },
  review: { label: "مراجعة", className: "bg-[#ede9fe] text-[#5b21b6]" },
};

const genderMap: Record<Gender, { label: string; className: string }> = {
  male: { label: "ذكر", className: "bg-[#eff6ff] text-[#1d4ed8]" },
  female: { label: "أنثى", className: "bg-[#fdf2f8] text-[#9d174d]" },
};

const attendanceMap: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  present: { label: "حاضر", className: "bg-[#dcfce7] text-[#166534]" },
  absent: { label: "غائب", className: "bg-[#fee2e2] text-[#991b1b]" },
};

export function RatingBadge({ value }: { value: Rating }) {
  const { label, className } = ratingMap[value];
  return <span className={cn(pill, className)}>{label}</span>;
}

export function SessionTypeBadge({ value }: { value: SessionType }) {
  const { label, className } = sessionTypeMap[value];
  return <span className={cn(pill, className)}>{label}</span>;
}

export function GenderBadge({ value }: { value: Gender }) {
  const { label, className } = genderMap[value];
  return <span className={cn(pill, className)}>{label}</span>;
}

export function AttendanceBadge({ value }: { value: AttendanceStatus }) {
  const { label, className } = attendanceMap[value];
  return <span className={cn(pill, className)}>{label}</span>;
}
