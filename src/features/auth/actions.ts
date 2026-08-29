"use server";

import { redirect } from "next/navigation";

import {
  roleHomePath,
  resolveLoginEmail,
  type LoginActionState,
} from "./shared";
import { getAppUserByAuthId } from "./session";
import { createSupabaseServerActionClient } from "@/infrastructure/auth/server";
import { getDb } from "@/db/client";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  // The field is now "identifier" (email OR legacy username). Fall back to the
  // old "username" field name so nothing breaks if an older form posts it.
  const identifier = String(
    formData.get("identifier") ?? formData.get("username") ?? ""
  ).trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return {
      errorMessage: "من فضلك أدخل البريد الإلكتروني (أو اسم المستخدم) وكلمة المرور.",
    };
  }

  const supabase = await createSupabaseServerActionClient();

  if (!supabase) {
    return {
      errorMessage: "إعدادات Supabase غير مكتملة. أضف القيم إلى ملف .env.local أولاً.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolveLoginEmail(identifier),
    password,
  });

  if (error || !data.user) {
    // A newly-registered user who hasn't clicked the verification link yet
    // fails here with an "email not confirmed" error — guide them rather than
    // showing the generic invalid-credentials message.
    const detail = error?.message?.toLowerCase() ?? "";
    if (detail.includes("confirm")) {
      return {
        errorMessage:
          "يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المُرسَل إليك، ثم حاول تسجيل الدخول.",
      };
    }
    return {
      errorMessage: "البريد الإلكتروني أو كلمة المرور غير صحيحين.",
    };
  }

  const db = getDb();
  if (!db) {
    return {
      errorMessage: "إعدادات قاعدة البيانات غير مكتملة. أضف DATABASE_URL إلى ملف .env.local.",
    };
  }

  const appUser = await getAppUserByAuthId(db, data.user.id);

  if (!appUser) {
    await supabase.auth.signOut();
    return {
      errorMessage: "تم تسجيل الدخول لكن لا يوجد ملف مستخدم مرتبط بهذا الحساب.",
    };
  }

  if (!appUser.is_active) {
    await supabase.auth.signOut();
    return {
      errorMessage:
        "هذا الحساب غير مُفعّل بعد. إن كنت قد سجّلت للتو كمحفّظ، فحسابك بانتظار موافقة المشرف على التفعيل.",
    };
  }

  redirect(roleHomePath(appUser.role));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerActionClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}
