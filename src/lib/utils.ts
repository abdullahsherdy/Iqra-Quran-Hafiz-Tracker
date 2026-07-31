import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a Date as a YYYY-MM-DD string (A4: single source for this pattern). */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Today's date as a YYYY-MM-DD string. */
export function todayDateString(): string {
  return toDateString(new Date());
}
