import { BookOpenText } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentAppUser } from "@/features/auth/session";
import { roleHomePath } from "@/features/auth/shared";

export default async function LoginPage() {
  const user = await getCurrentAppUser();

  if (user?.is_active) {
    redirect(roleHomePath(user.role));
  }

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-primary/20 bg-card p-8 shadow-xl shadow-primary/10">
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-2.5">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 shadow-sm">
          <BookOpenText className="size-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-primary">{appName}</h1>
        <p className="text-sm font-medium text-muted-foreground text-center leading-relaxed">
          اقرأ وارتق ورتل
        </p>
        <p className="text-xs text-primary/70 font-semibold text-center leading-relaxed tracking-wide">
          {"{"}اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ{"}"}
        </p>
      </div>

      {/* Divider */}
      <div className="mb-6 h-px w-full bg-border/60" />

      <LoginForm />
    </div>
  );
}
