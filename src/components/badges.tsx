import { cn } from "@/lib/utils";
import type {
  Rating,
  SessionType,
  Gender,
  StudentStatus,
} from "@/domain/types";

export type { Rating, SessionType, Gender, StudentStatus };

const pill =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

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

const studentStatusMap: Record<StudentStatus, { label: string; className: string }> = {
  active:    { label: "نشط",           className: "bg-[#dcfce7] text-[#166534]" },
  paused:    { label: "موقوف مؤقتاً",  className: "bg-[#fef9c3] text-[#854d0e]" },
  graduated: { label: "خريج",          className: "bg-[#dbeafe] text-[#1e40af]" },
  withdrawn: { label: "منسحب",         className: "bg-[#fee2e2] text-[#991b1b]" },
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

export function StudentStatusBadge({ value }: { value: StudentStatus }) {
  const { label, className } = studentStatusMap[value] ?? studentStatusMap.active;
  return <span className={cn(pill, className)}>{label}</span>;
}
