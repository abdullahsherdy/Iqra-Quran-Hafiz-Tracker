import { describe, it, expect } from "vitest";
import { validateSessionPayload } from "./sessions";

describe("validateSessionPayload", () => {
  const valid = {
    student_id: "s1",
    session_date: "2026-07-01",
    session_type: "new_memorization" as const,
    surah_id: 2,
    from_ayah: 1,
    to_ayah: 10,
    rating: "excellent" as const,
  };

  it("returns data for a valid payload", () => {
    const result = validateSessionPayload(valid, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.student_id).toBe("s1");
      expect(result.data.from_ayah).toBe(1);
      expect(result.data.to_ayah).toBe(10);
    }
  });

  it("returns data with null pages when absent", () => {
    const result = validateSessionPayload(valid, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.pages).toBeNull();
    }
  });

  it("returns data with null notes when absent", () => {
    const result = validateSessionPayload(valid, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts a valid pages count", () => {
    const result = validateSessionPayload({ ...valid, pages: 5 }, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.pages).toBe(5);
    }
  });

  it("accepts pages = 0", () => {
    const result = validateSessionPayload({ ...valid, pages: 0 }, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.pages).toBe(0);
    }
  });

  it("rejects missing student_id", () => {
    const result = validateSessionPayload({ ...valid, student_id: "" }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار الطالب");
  });

  it("rejects missing session_date", () => {
    const result = validateSessionPayload({ ...valid, session_date: "" }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى تحديد تاريخ الجلسة");
  });

  it("rejects invalid session_type", () => {
    const result = validateSessionPayload(
      { ...valid, session_type: "invalid" as unknown as string },
      286,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار نوع الجلسة");
  });

  it("rejects missing surah_id", () => {
    const result = validateSessionPayload({ ...valid, surah_id: undefined as unknown as number }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار السورة");
  });

  it("rejects invalid rating", () => {
    const result = validateSessionPayload(
      { ...valid, rating: "invalid" as unknown as string },
      286,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار التقييم");
  });

  it("rejects from_ayah < 1", () => {
    const result = validateSessionPayload({ ...valid, from_ayah: 0 }, 286);
    expect("error" in result).toBe(true);
  });

  it("rejects from > to", () => {
    const result = validateSessionPayload({ ...valid, from_ayah: 20, to_ayah: 10 }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("آية البداية يجب أن تكون أقل من أو تساوي آية النهاية");
  });

  it("rejects to_ayah exceeding total ayahs", () => {
    const result = validateSessionPayload({ ...valid, to_ayah: 300 }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("286");
  });

  it("rejects negative pages", () => {
    const result = validateSessionPayload({ ...valid, pages: -1 }, 286);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("عدد الصفحات يجب أن يكون رقماً صحيحاً");
  });

  it("rejects non-numeric pages", () => {
    const result = validateSessionPayload({ ...valid, pages: "abc" as unknown as number }, 286);
    expect("error" in result).toBe(true);
  });

  it("accepts string notes", () => {
    const result = validateSessionPayload({ ...valid, notes: "ملاحظة" }, 286);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.notes).toBe("ملاحظة");
    }
  });

  it("accepts review session_type", () => {
    const result = validateSessionPayload({ ...valid, session_type: "review" }, 286);
    expect("data" in result).toBe(true);
  });
});
