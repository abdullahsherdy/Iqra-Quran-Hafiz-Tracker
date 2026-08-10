import { describe, it, expect } from "vitest";
import { validateSessionPayload } from "./sessions";

describe("validateSessionPayload", () => {
  // Helper: build a valid payload
  const validBody = {
    student_id: "s1",
    session_date: "2026-07-01",
    overall_rating: "good" as const,
    items: [
      {
        session_type: "new_memorization" as const,
        surah_id: 2,
        from_ayah: 1,
        to_ayah: 10,
        rating: "excellent" as const,
      },
    ],
  };

  // Helper: surah ayah counts map (surah 2 = 286 ayahs, surah 1 = 7)
  const surahMap = new Map([
    [1, 7],
    [2, 286],
  ]);

  it("returns data for a valid single-item payload", () => {
    const result = validateSessionPayload(validBody, surahMap);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.student_id).toBe("s1");
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].from_ayah).toBe(1);
      expect(result.data.items[0].to_ayah).toBe(10);
      expect(result.data.items[0].pages).toBeNull();
      expect(result.data.items[0].notes).toBeNull();
    }
  });

  it("returns data for a multi-item payload", () => {
    const result = validateSessionPayload(
      {
        ...validBody,
        items: [
          { session_type: "review", surah_id: 2, from_ayah: 1, to_ayah: 5, rating: "good" },
          { session_type: "new_memorization", surah_id: 2, from_ayah: 10, to_ayah: 20, rating: "excellent" },
        ],
      },
      surahMap,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items[0].session_type).toBe("review");
      expect(result.data.items[1].session_type).toBe("new_memorization");
    }
  });

  it("returns data with null notes when absent", () => {
    const result = validateSessionPayload(validBody, surahMap);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts a valid pages count on items", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], pages: 5 }] },
      surahMap,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.items[0].pages).toBe(5);
    }
  });

  it("accepts pages = 0 on items", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], pages: 0 }] },
      surahMap,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.items[0].pages).toBe(0);
    }
  });

  it("rejects missing student_id", () => {
    const result = validateSessionPayload({ ...validBody, student_id: "" }, surahMap);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار الطالب");
  });

  it("rejects missing session_date", () => {
    const result = validateSessionPayload({ ...validBody, session_date: "" }, surahMap);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى تحديد تاريخ الجلسة");
  });

  it("rejects malformed session_date", () => {
    const result = validateSessionPayload({ ...validBody, session_date: "2026-7-1" }, surahMap);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("صيغة التاريخ");
  });

  it("rejects a future session_date when todayDate is provided", () => {
    const result = validateSessionPayload(
      { ...validBody, session_date: "2026-07-02" },
      surahMap,
      "2026-07-01",
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("مستقبلي");
  });

  it("accepts a session_date equal to todayDate", () => {
    const result = validateSessionPayload(
      { ...validBody, session_date: "2026-07-01" },
      surahMap,
      "2026-07-01",
    );
    expect("data" in result).toBe(true);
  });

  it("does not check future dates when todayDate is omitted", () => {
    const result = validateSessionPayload(
      { ...validBody, session_date: "9999-12-31" },
      surahMap,
    );
    expect("data" in result).toBe(true);
  });

  it("rejects invalid overall_rating", () => {
    const result = validateSessionPayload(
      { ...validBody, overall_rating: "invalid" as unknown as string },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("يرجى اختيار التقييم العام للجلسة");
  });

  it("rejects empty items array", () => {
    const result = validateSessionPayload({ ...validBody, items: [] }, surahMap);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("عنصر واحد على الأقل");
  });

  it("rejects missing items field", () => {
    const result = validateSessionPayload(
      { student_id: "s1", session_date: "2026-07-01", overall_rating: "good" },
      surahMap,
    );
    expect("error" in result).toBe(true);
  });

  it("rejects invalid session_type in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], session_type: "invalid" as unknown as string }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("نوع الجلسة");
  });

  it("rejects missing surah_id in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], surah_id: undefined as unknown as number }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("السورة");
  });

  it("rejects invalid rating in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], rating: "invalid" as unknown as string }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("التقييم");
  });

  it("rejects from_ayah < 1 in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], from_ayah: 0 }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
  });

  it("rejects from > to in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], from_ayah: 20, to_ayah: 10 }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("آية البداية");
  });

  it("rejects to_ayah exceeding surah total", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], surah_id: 1, to_ayah: 100 }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("7");
  });

  it("rejects negative pages in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], pages: -1 }] },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("الصفحات");
  });

  it("accepts string notes on items", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], notes: "ملاحظة" }] },
      surahMap,
    );
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data.items[0].notes).toBe("ملاحظة");
    }
  });

  it("accepts review session_type in item", () => {
    const result = validateSessionPayload(
      { ...validBody, items: [{ ...validBody.items[0], session_type: "review" }] },
      surahMap,
    );
    expect("data" in result).toBe(true);
  });

  it("rejects notes exceeding max length", () => {
    const longNotes = "x".repeat(2001);
    const result = validateSessionPayload(
      { ...validBody, notes: longNotes },
      surahMap,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toContain("طويلة جداً");
  });
});