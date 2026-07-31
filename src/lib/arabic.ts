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

/** Format an ISO date string (YYYY-MM-DD) as an Arabic localized date. */
export function formatArabicDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG");
}
