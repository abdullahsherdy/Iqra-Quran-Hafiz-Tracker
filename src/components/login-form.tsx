"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { User, Lock, Eye, EyeOff, Loader2 } from "lucide-react";

import {
  initialLoginActionState,
  type LoginActionState,
} from "@/features/auth/shared";
import { loginAction } from "@/features/auth/actions";

/* ── Shared styles ───────────────────────────────────────────────────── */
const fieldWrap =
  "flex items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/60 transition-all";

const iconSlot =
  "flex shrink-0 items-center justify-center border-r border-border bg-secondary/30 px-3 text-muted-foreground";

const baseInput =
  "flex-1 bg-transparent px-3 py-2.5 text-base text-right placeholder:text-muted-foreground/70 focus:outline-none";

/* ── Submit button ───────────────────────────────────────────────────── */
function SubmitButton() {
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
          <span>جارٍ تسجيل الدخول...</span>
        </>
      ) : (
        "تسجيل الدخول"
      )}
    </button>
  );
}

/* ── Main form ───────────────────────────────────────────────────────── */
export function LoginForm() {
  const [state, formAction] = useActionState<LoginActionState, FormData>(
    loginAction,
    initialLoginActionState
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      {/* Username --------------------------------------------------- */}
      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm font-semibold text-foreground">
          اسم المستخدم
        </label>
        {/* Icon is a SIBLING flex cell — can never overlap the input */}
        <div className={fieldWrap}>
          <div className={iconSlot} aria-hidden>
            <User className="size-4" />
          </div>
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="أدخل اسم المستخدم"
            dir="rtl"
            className={baseInput}
          />
        </div>
      </div>

      {/* Password --------------------------------------------------- */}
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
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="أدخل كلمة المرور"
            dir="rtl"
            className={baseInput}
          />
          {/* Eye toggle on the far LEFT (end-side in RTL) */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="flex shrink-0 items-center justify-center border-l border-border bg-secondary/30 px-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {/* Remember me + Forgot password ------------------------------ */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="remember"
            className="size-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">تذكرني</span>
        </label>
        <button
          type="button"
          className="text-sm text-primary/80 hover:text-primary transition-colors cursor-pointer"
          tabIndex={-1}
        >
          نسيت كلمة المرور؟
        </button>
      </div>

      {/* Error ------------------------------------------------------ */}
      {state.errorMessage ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.errorMessage}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
