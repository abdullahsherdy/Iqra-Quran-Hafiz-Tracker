import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  BarChart3,
  Award,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/domain/types";

export type Role = AppRole;

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const navItems: NavItem[] = [
  {
    label: "لوحة التحكم",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "الطلاب",
    href: "/admin/students",
    icon: Users,
  },
  {
    label: "المحفظون",
    href: "/admin/teachers",
    icon: GraduationCap,
    adminOnly: true,
  },
  {
    label: "إسناد الطلاب",
    href: "/admin/assignments",
    icon: ClipboardList,
    adminOnly: true,
  },
  {
    label: "الإجازات",
    href: "/admin/ijazat",
    icon: BookOpen,
  },
  {
    label: "التقارير",
    href: "/admin/reports",
    icon: BarChart3,
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return navItems.filter((item) => !item.adminOnly || role === "admin");
}

export function teacherNavItems(): NavItem[] {
  return [
    { label: "لوحة التحكم", href: "/teacher", icon: LayoutDashboard },
    { label: "الطلاب", href: "/teacher/students", icon: Users },
    {
      label: "تسجيل جلسة",
      href: "/teacher/session/new",
      icon: BookOpen,
    },
    {
      label: "منح إجازة",
      href: "/teacher/ijazat/new",
      icon: Award,
    },
    {
      label: "التقارير",
      href: "/teacher/reports",
      icon: BarChart3,
    },
  ];
}

export function getNavItems(role: Role): NavItem[] {
  return role === "admin" ? navItemsForRole(role) : teacherNavItems();
}
