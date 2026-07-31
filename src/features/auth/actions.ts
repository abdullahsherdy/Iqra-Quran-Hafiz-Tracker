"use server";

import { redirect } from "next/navigation";

import {
  roleHomePath,
  usernameToEmail,
  type LoginActionState,
} from "./shared";
import { getAppUserByAuthId } from "./session";
import { createSupabaseServerActionClient } from "@/infrastructure/auth/server";
import { getDb } from "@/db/client";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return {
      errorMessage: "من فضلك أدخل اسم المستخدم وكلمة المرور.",
    };
  }

  const supabase = await createSupabaseServerActionClient();

  if (!supabase) {
    return {
      errorMessage: "إعدادات Supabase غير مكتملة. أضف القيم إلى ملف .env.local أولاً.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error || !data.user) {
    return {
      errorMessage: "اسم المستخدم أو كلمة المرور غير صحيحين.",
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
      errorMessage: "هذا الحساب غير نشط حالياً.",
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
