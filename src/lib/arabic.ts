const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

/** Convert Western digits to Arabic-Eastern numerals (e.g. 36 → ٣٦). */
export function toArabicNumerals(value: number | string): string {
  return String(value).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

export function formatSurahLabel(id: number, nameArabic: string): string {
  return `${toArabicNumerals(id)} - ${nameArabic}`;
}

export function formatAyahPreview(
  surahName: string,
  fromAyah: number,
  toAyah: number
): string {
  return `سورة ${surahName} من الآية ${toArabicNumerals(fromAyah)} إلى الآية ${toArabicNumerals(toAyah)}`;
}

/** Format an ISO date string (YYYY-MM-DD) as an Arabic localized date in Africa/Cairo timezone. */
export function formatArabicDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/** Format an ISO date string as an Arabic localized date with Western (0-9) numerals. */
export function formatWesternDate(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    numberingSystem: "latn",
  }).format(new Date(iso));
}
