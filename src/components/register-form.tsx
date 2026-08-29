"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Phone,
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  BookOpen,
} from "lucide-react";

import {
  initialRegisterActionState,
  type RegisterActionState,
} from "@/features/auth/shared";
import {
  registerStudentAction,
  registerTeacherAction,
} from "@/features/auth/register";

/* ── Shared field styles (mirrors login-form) ────────────────────────── */
const fieldWrap =
  "flex items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/60 transition-all";

const iconSlot =
  "flex shrink-0 items-center justify-center border-r border-border bg-secondary/30 px-3 text-muted-foreground";

const baseInput =
  "flex-1 bg-transparent px-3 py-2.5 text-base text-right placeholder:text-muted-foreground/70 focus:outline-none";

type Role = "student" | "teacher";

/* ── Submit button ───────────────────────────────────────────────────── */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full py-3.5 text-base font-bold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
    >
      {pending ? (
        <>
          <Loader2 className="size-4.5 animate-spin" />
          <span>جارٍ إنشاء الحساب...</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

/* ── Reusable text field ─────────────────────────────────────────────── */
function TextField({
  id,
  name,
  label,
  placeholder,
  type = "text",
  icon: Icon,
  autoComplete,
  optional,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  icon: typeof User;
  autoComplete?: string;
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label}
        {optional ? <span className="text-muted-foreground font-normal"> (اختياري)</span> : null}
      </label>
      <div className={fieldWrap}>
        <div className={iconSlot} aria-hidden>
          <Icon className="size-4" />
        </div>
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          dir="rtl"
          className={baseInput}
        />
      </div>
    </div>
  );
}

/* ── Password field (with show/hide) ─────────────────────────────────── */
function PasswordField() {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="password" className="block text-sm font-semibold text-foreground">
        كلمة المرور
      </label>
      <div className={fieldWrap}>
        <div className={iconSlot} aria-hidden>
          <Lock className="size-4" />
        </div>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="6 أحرف على الأقل"
          dir="rtl"
          className={baseInput}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="flex shrink-0 items-center justify-center border-l border-border bg-secondary/30 px-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/* ── Gender radio (pills) ────────────────────────────────────────────── */
function GenderField() {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-foreground">الجنس</span>
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: "male", label: "ذكر" },
          { value: "female", label: "أنثى" },
        ].map((g) => (
          <label
            key={g.value}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
          >
            <input type="radio" name="gender" value={g.value} className="sr-only" />
            {g.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ── Success panel ───────────────────────────────────────────────────── */
function SuccessPanel({ message }: { message: string }) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-primary/10 p-3.5 ring-1 ring-primary/20">
          <CheckCircle2 className="size-8 text-primary" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-foreground">تحقّق من بريدك الإلكتروني</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
      <Link
        href="/login"
        className="btn-primary inline-flex w-full items-center justify-center py-3 text-base font-bold"
      >
        الذهاب إلى تسجيل الدخول
      </Link>
    </div>
  );
}

/* ── Main form ───────────────────────────────────────────────────────── */
export function RegisterForm() {
  const [role, setRole] = useState<Role>("student");

  const [studentState, studentAction] = useActionState<RegisterActionState, FormData>(
    registerStudentAction,
    initialRegisterActionState
  );
  const [teacherState, teacherAction] = useActionState<RegisterActionState, FormData>(
    registerTeacherAction,
    initialRegisterActionState
  );

  const state = role === "student" ? studentState : teacherState;
  const formAction = role === "student" ? studentAction : teacherAction;

  if (state.status === "success" && state.message) {
    return <SuccessPanel message={state.message} />;
  }

  return (
    <div className="space-y-5">
      {/* Role segmented control ------------------------------------ */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/50 p-1.5">
        <button
          type="button"
          onClick={() => setRole("student")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all cursor-pointer ${
            role === "student"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="size-4" />
          أنا طالب
        </button>
        <button
          type="button"
          onClick={() => setRole("teacher")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all cursor-pointer ${
            role === "teacher"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GraduationCap className="size-4" />
          أنا محفّظ
        </button>
      </div>

      {/*
        Two independent action states are kept above; `key={role}` remounts the
        form on toggle so half-typed values from the other role don't linger.
      */}
      <form key={role} action={formAction} className="space-y-4">
        <TextField
          id="name"
          name="name"
          label="الاسم"
          placeholder={role === "student" ? "اسم الطالب" : "اسمك الكامل"}
          icon={User}
          autoComplete="name"
        />

        <TextField
          id="email"
          name="email"
          label="البريد الإلكتروني"
          placeholder="example@email.com"
          type="email"
          icon={Mail}
          autoComplete="email"
        />

        <PasswordField />

        <GenderField />

        {role === "student" ? (
          <>
            <TextField
              id="guardian_name"
              name="guardian_name"
              label="اسم ولي الأمر"
              placeholder="اسم ولي الأمر"
              icon={Users}
            />
            <TextField
              id="guardian_phone"
              name="guardian_phone"
              label="رقم هاتف ولي الأمر"
              placeholder="01xxxxxxxxx"
              type="tel"
              icon={Phone}
              autoComplete="tel"
            />
            <TextField
              id="birth_date"
              name="birth_date"
              label="تاريخ الميلاد"
              placeholder="YYYY-MM-DD"
              type="date"
              icon={Calendar}
              optional
            />
          </>
        ) : (
          <TextField
            id="phone"
            name="phone"
            label="رقم الهاتف"
            placeholder="01xxxxxxxxx"
            type="tel"
            icon={Phone}
            autoComplete="tel"
            optional
          />
        )}

        {/* Error ----------------------------------------------------- */}
        {state.status === "error" && state.message ? (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{state.message}</span>
          </p>
        ) : null}

        <SubmitButton label="إنشاء حساب" />
      </form>

      {/* Login link ------------------------------------------------- */}
      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{" "}
        <Link
          href="/login"
          className="font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
