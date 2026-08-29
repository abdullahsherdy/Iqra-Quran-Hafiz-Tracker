import { describe, it, expect } from "vitest";

import {
  validateEmail,
  validatePassword,
  validateStudentRegistration,
  validateTeacherRegistration,
  MIN_PASSWORD_LENGTH,
} from "./auth";
import { resolveLoginEmail, usernameToEmail } from "@/features/auth/shared";

describe("validateEmail", () => {
  it("accepts a well-formed email", () => {
    expect(validateEmail("student@example.com")).toBeNull();
  });

  it("trims surrounding whitespace before checking", () => {
    expect(validateEmail("  user@example.com  ")).toBeNull();
  });

  it("rejects an empty / missing email", () => {
    expect(validateEmail("")).toBe("البريد الإلكتروني مطلوب");
    expect(validateEmail("   ")).toBe("البريد الإلكتروني مطلوب");
    expect(validateEmail(undefined)).toBe("البريد الإلكتروني مطلوب");
    expect(validateEmail(null)).toBe("البريد الإلكتروني مطلوب");
  });

  it("rejects malformed emails", () => {
    for (const bad of ["plainaddress", "no@domain", "@nolocal.com", "spaces in@x.com", "a@b@c.com"]) {
      expect(validateEmail(bad)).toBe("صيغة البريد الإلكتروني غير صحيحة");
    }
  });

  it("rejects non-string input", () => {
    expect(validateEmail(123)).toBe("البريد الإلكتروني مطلوب");
    expect(validateEmail({})).toBe("البريد الإلكتروني مطلوب");
  });
});

describe("validatePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects a password shorter than the minimum", () => {
    const msg = `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`;
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe(msg);
    expect(validatePassword("")).toBe(msg);
  });

  it("rejects non-string input", () => {
    expect(validatePassword(undefined)).not.toBeNull();
    expect(validatePassword(123456)).not.toBeNull();
  });
});

describe("validateStudentRegistration", () => {
  const valid = {
    email: "child@example.com",
    password: "secret123",
    name: "أحمد",
    gender: "male",
    guardian_name: "والد أحمد",
    guardian_phone: "01012345678",
    birth_date: "2015-06-01",
  };

  it("accepts a complete, valid payload", () => {
    expect(validateStudentRegistration(valid)).toBeNull();
  });

  it("accepts when the optional birth_date is null", () => {
    expect(validateStudentRegistration({ ...valid, birth_date: null })).toBeNull();
  });

  it("checks the email before the student fields", () => {
    expect(
      validateStudentRegistration({ ...valid, email: "bad" })
    ).toBe("صيغة البريد الإلكتروني غير صحيحة");
  });

  it("checks the password after the email", () => {
    expect(
      validateStudentRegistration({ ...valid, password: "123" })
    ).toBe(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
  });

  it("delegates student-record rules to validateStudentPayload (guardian phone)", () => {
    expect(
      validateStudentRegistration({ ...valid, guardian_phone: "12345" })
    ).toBe("رقم الهاتف يجب أن يكون 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015");
  });

  it("requires a guardian name", () => {
    expect(
      validateStudentRegistration({ ...valid, guardian_name: "" })
    ).toBe("اسم ولي الأمر مطلوب");
  });

  it("rejects an invalid gender", () => {
    expect(
      validateStudentRegistration({ ...valid, gender: "other" })
    ).toBe("الجنس يجب أن يكون ذكر أو أنثى");
  });
});

describe("validateTeacherRegistration", () => {
  const valid = {
    email: "teacher@example.com",
    password: "secret123",
    name: "الأستاذ محمد",
    gender: "male",
  };

  it("accepts a complete, valid payload", () => {
    expect(validateTeacherRegistration(valid)).toBeNull();
  });

  it("requires a name", () => {
    expect(validateTeacherRegistration({ ...valid, name: "   " })).toBe("الاسم مطلوب");
    expect(validateTeacherRegistration({ ...valid, name: undefined })).toBe("الاسم مطلوب");
  });

  it("rejects a bad email", () => {
    expect(
      validateTeacherRegistration({ ...valid, email: "nope" })
    ).toBe("صيغة البريد الإلكتروني غير صحيحة");
  });

  it("rejects a short password", () => {
    expect(
      validateTeacherRegistration({ ...valid, password: "x" })
    ).toBe(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
  });

  it("rejects an invalid gender", () => {
    expect(validateTeacherRegistration({ ...valid, gender: "" })).toBe(
      "الجنس يجب أن يكون ذكر أو أنثى"
    );
  });

  it("does not require guardian fields (unlike student)", () => {
    // A teacher payload has no guardian_name/phone — it must still pass.
    expect(validateTeacherRegistration(valid)).toBeNull();
  });
});

describe("resolveLoginEmail", () => {
  it("uses an email identifier as-is, lowercased and trimmed", () => {
    expect(resolveLoginEmail("Person@Example.COM")).toBe("person@example.com");
    expect(resolveLoginEmail("  a@b.com  ")).toBe("a@b.com");
  });

  it("maps a legacy username to the synthetic auth email", () => {
    // Compare against usernameToEmail so the test is env-agnostic (the domain
    // comes from AUTH_EMAIL_DOMAIN with a default fallback).
    expect(resolveLoginEmail("Admin")).toBe(usernameToEmail("Admin"));
    expect(resolveLoginEmail("teacher_one")).toBe(usernameToEmail("teacher_one"));
  });

  it("routes on the presence of '@'", () => {
    expect(resolveLoginEmail("has@at.sign")).toContain("@at.sign");
    expect(resolveLoginEmail("noatsign")).not.toContain("noatsign@noatsign");
  });
});
