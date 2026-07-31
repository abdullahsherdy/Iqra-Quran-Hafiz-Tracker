"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, BookOpenText, ChevronRight, Menu } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { type Role, getNavItems } from "@/lib/nav";
import { signOutAction } from "@/features/auth/actions";

interface AppShellProps {
  role: Role;
  username?: string;
  children: React.ReactNode;
}

export function AppShell({ role, username, children }: AppShellProps) {
  const pathname = usePathname();
  const items = getNavItems(role);
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ";
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (href: string) =>
    href === `/${role}`
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Desktop sidebar (right side in RTL) */}
      <aside
        className={cn(
          "hidden shrink-0 border-l border-border bg-card md:flex md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto transition-all duration-300",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center border-b border-border py-4 gap-4">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-lg hover:bg-secondary text-primary transition-colors cursor-pointer"
              title="فتح القائمة"
            >
              <Menu className="size-6" />
            </button>
            <BookOpenText className="size-6 text-primary" />
          </div>
        ) : (
          <div className="flex flex-col border-b border-border p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpenText className="size-6 text-primary shrink-0" />
                <span className="text-lg font-bold text-primary">{appName}</span>
              </div>
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
                title="إغلاق القائمة"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed text-right font-medium">
              اقرأ وارتق ورتل -{"{"}اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ{"}"}
            </p>
          </div>
        )}

        <nav className={cn("p-2.5", isCollapsed ? "space-y-3" : "space-y-1.5")}>
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center rounded-lg transition-all",
                  isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-[15px] font-semibold",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-secondary"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={cn("shrink-0", isCollapsed ? "size-6" : "size-5")} />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2.5 mt-auto">
          {!isCollapsed && (
            <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold text-muted-foreground">
              <span>{username ?? "—"}</span>
            </div>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className={cn(
                "flex w-full items-center rounded-lg transition-colors text-foreground hover:bg-secondary cursor-pointer",
                isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-[15px] font-semibold"
              )}
              title={isCollapsed ? "تسجيل الخروج" : undefined}
            >
              <LogOut className={cn("shrink-0", isCollapsed ? "size-6" : "size-5")} />
              {!isCollapsed && <span>تسجيل الخروج</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <h1 className="text-2xl font-bold text-foreground">
            {items.find((i) => isActive(i.href))?.label ?? appName}
          </h1>
          {/* Mobile app logo */}
          <div className="flex items-center gap-2 md:hidden">
            <BookOpenText className="size-6 text-primary" />
            <span className="text-lg font-bold text-primary">{appName}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex overflow-x-auto border-t border-border bg-card md:hidden snap-x snap-mandatory">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[80px] shrink-0 flex-col items-center gap-0.5 py-3 px-4 text-xs snap-center",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
