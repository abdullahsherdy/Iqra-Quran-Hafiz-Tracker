import { describe, it, expect } from "vitest";
import {
  validateInitialMemorization,
  validateStudentPayload,
  getLevelInfo,
  countsFromInitialMemorization,
} from "./students";

describe("validateInitialMemorization (I1)", () => {
  it("returns null for empty rows", () => {
    expect(validateInitialMemorization([])).toBeNull();
  });

  it("returns null for valid memorized row", () => {
    expect(
      validateInitialMemorization([{ juz_number: 1, status: "memorized" }]),
    ).toBeNull();
  });

  it("returns null for valid with_ijaza row with sheikh name", () => {
    expect(
      validateInitialMemorization([
        { juz_number: 5, status: "with_ijaza", sheikh_name: "الشيخ أحمد" },
      ]),
    ).toBeNull();
  });

  it("rejects juz_number below 1", () => {
    expect(
      validateInitialMemorization([{ juz_number: 0, status: "memorized" }]),
    ).toBe("رقم الجزء يجب أن يكون بين 1 و 30");
  });

  it("rejects juz_number above 30", () => {
    expect(
      validateInitialMemorization([{ juz_number: 31, status: "memorized" }]),
    ).toBe("رقم الجزء يجب أن يكون بين 1 و 30");
  });

  it("rejects invalid status enum", () => {
    expect(
      validateInitialMemorization([
        { juz_number: 1, status: "foo" as string },
      ]),
    ).toBe("حالة الحفظ غير صحيحة للجزء 1");
  });

  it("rejects with_ijaza without sheikh_name", () => {
    expect(
      validateInitialMemorization([
        { juz_number: 1, status: "with_ijaza", sheikh_name: "" },
      ]),
    ).toBe("يرجى إدخال اسم الشيخ للجزء 1");
  });

  it("rejects with_ijaza with null sheikh_name", () => {
    expect(
      validateInitialMemorization([
        { juz_number: 2, status: "with_ijaza", sheikh_name: null },
      ]),
    ).toBe("يرجى إدخال اسم الشيخ للجزء 2");
  });
});

describe("validateStudentPayload (I2)", () => {
  const valid = {
    name: "عبد الله",
    gender: "male",
    guardian_name: "محمد",
    guardian_phone: "0512345678",
  };

  it("returns null for a valid full payload", () => {
    expect(validateStudentPayload(valid)).toBeNull();
  });

  it("returns null for a valid payload with dates", () => {
    expect(
      validateStudentPayload({
        ...valid,
        birth_date: "2010-05-15",
        enrollment_date: "2024-01-01",
      }),
    ).toBeNull();
  });

  it("returns null when optional fields are absent", () => {
    expect(validateStudentPayload({ name: valid.name, gender: valid.gender, guardian_name: valid.guardian_name, guardian_phone: valid.guardian_phone })).toBeNull();
  });

  it("rejects missing name", () => {
    expect(validateStudentPayload({ ...valid, name: "" })).toBe("الاسم مطلوب");
  });

  it("rejects missing guardian_name", () => {
    expect(
      validateStudentPayload({ ...valid, guardian_name: "" }),
    ).toBe("اسم ولي الأمر مطلوب");
  });

  it("rejects missing guardian_phone", () => {
    expect(
      validateStudentPayload({ ...valid, guardian_phone: "" }),
    ).toBe("رقم هاتف ولي الأمر مطلوب");
  });

  it("rejects invalid gender", () => {
    expect(
      validateStudentPayload({ ...valid, gender: "other" }),
    ).toBe("الجنس يجب أن يكون ذكر أو أنثى");
  });

  it("rejects malformed birth_date", () => {
    expect(
      validateStudentPayload({ ...valid, birth_date: "15/05/2010" }),
    ).toBe("صيغة تاريخ الميلاد غير صحيحة (YYYY-MM-DD)");
  });

  it("rejects malformed enrollment_date", () => {
    expect(
      validateStudentPayload({ ...valid, enrollment_date: "2024/01/01" }),
    ).toBe("صيغة تاريخ التسجيل غير صحيحة (YYYY-MM-DD)");
  });

  it("rejects invalid status", () => {
    expect(
      validateStudentPayload({ ...valid, status: "deleted" }),
    ).toBe("حالة الطالب غير صحيحة");
  });

  it("accepts all valid statuses", () => {
    for (const status of ["active", "paused", "graduated", "withdrawn"]) {
      expect(validateStudentPayload({ ...valid, status })).toBeNull();
    }
  });

  it("accepts null birth_date and enrollment_date", () => {
    expect(
      validateStudentPayload({ ...valid, birth_date: null, enrollment_date: null }),
    ).toBeNull();
  });
});

describe("getLevelInfo", () => {
  it("returns beginner for 0 juz", () => {
    expect(getLevelInfo(0)).toEqual({ level: "beginner", label: "مبتدئ" });
  });

  it("returns beginner for 4 juz", () => {
    expect(getLevelInfo(4)).toEqual({ level: "beginner", label: "مبتدئ" });
  });

  it("returns intermediate for 5 juz", () => {
    expect(getLevelInfo(5)).toEqual({ level: "intermediate", label: "متوسط" });
  });

  it("returns intermediate for 14 juz", () => {
    expect(getLevelInfo(14)).toEqual({ level: "intermediate", label: "متوسط" });
  });

  it("returns advanced for 15 juz", () => {
    expect(getLevelInfo(15)).toEqual({ level: "advanced", label: "متقدم" });
  });

  it("returns advanced for 29 juz", () => {
    expect(getLevelInfo(29)).toEqual({ level: "advanced", label: "متقدم" });
  });

  it("returns completed for 30 juz", () => {
    expect(getLevelInfo(30)).toEqual({ level: "completed", label: "خاتم" });
  });
});

describe("countsFromInitialMemorization", () => {
  it("returns zeros for empty rows", () => {
    expect(countsFromInitialMemorization([])).toEqual({
      memorized_juz_count: 0,
      ijaza_juz_count: 0,
    });
  });

  it("counts all rows as memorized", () => {
    const rows = [
      { status: "memorized" },
      { status: "memorized" },
      { status: "with_ijaza" },
    ];
    expect(countsFromInitialMemorization(rows)).toEqual({
      memorized_juz_count: 3,
      ijaza_juz_count: 1,
    });
  });

  it("counts only with_ijaza as ijaza", () => {
    const rows = [
      { status: "memorized" },
      { status: "with_ijaza" },
      { status: "with_ijaza" },
    ];
    expect(countsFromInitialMemorization(rows)).toEqual({
      memorized_juz_count: 3,
      ijaza_juz_count: 2,
    });
  });
});
