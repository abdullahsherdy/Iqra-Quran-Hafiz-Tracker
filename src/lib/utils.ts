import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a Date as a YYYY-MM-DD string in the Africa/Cairo timezone. */
export function toDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

/**
 * Today's date as a YYYY-MM-DD string, in the Africa/Cairo timezone.
 * Uses en-CA locale which outputs ISO-style dates (YYYY-MM-DD).
 */
export function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}
