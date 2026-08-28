import { BookOpenText } from "lucide-react";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/register-form";
import { getCurrentAppUser } from "@/features/auth/session";
import { roleHomePath } from "@/features/auth/shared";

export default async function RegisterPage() {
  const user = await getCurrentAppUser();

  if (user?.is_active) {
    redirect(roleHomePath(user.role));
  }

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-primary/20 bg-card p-8 shadow-xl shadow-primary/10">
      {/* Branding */}
      <div className="mb-6 flex flex-col items-center gap-2.5">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 shadow-sm">
          <BookOpenText className="size-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-primary">{appName}</h1>
        <p className="text-sm font-medium text-muted-foreground text-center leading-relaxed">
          أنشئ حسابك للانضمام إلى الحلقة
        </p>
      </div>

      {/* Divider */}
      <div className="mb-6 h-px w-full bg-border/60" />

      <RegisterForm />
    </div>
  );
}
