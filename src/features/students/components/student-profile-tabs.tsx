"use client";

import { useState } from "react";
import Link from "next/link";
import { InitialMemorizationGrid, type JuzEntry } from "@/features/students/components/initial-memorization-grid";
import { StudentSessionsTab } from "@/features/sessions/components/student-sessions-tab";
import { StudentAttendanceTab } from "@/features/attendance/components/student-attendance-tab";
import { ProgressMap } from "@/features/students/components/progress-map";
import { StudentIjazatTab } from "@/features/ijazat/components/student-ijazat-tab";

export interface AssignmentHistoryRow {
  id: string;
  teacher_id: string;
  teacher_name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

type TabId = "progress" | "sessions" | "attendance" | "ijazat" | "assignments";

interface StudentProfileTabsProps {
  studentId: string;
  initMemValue: JuzEntry[];
  assignmentHistory?: AssignmentHistoryRow[];
  showAssignmentsTab?: boolean;
  isAdmin?: boolean;
}

const TABS: { id: TabId; label: string; adminOnly?: boolean }[] = [
  { id: "progress", label: "التقدم" },
  { id: "sessions", label: "الجلسات" },
  { id: "attendance", label: "الحضور" },
  { id: "ijazat", label: "الإجازات" },
  { id: "assignments", label: "الإسناد", adminOnly: true },
];

export function StudentProfileTabs({
  studentId,
  initMemValue,
  assignmentHistory = [],
  showAssignmentsTab = false,
  isAdmin = false,
}: StudentProfileTabsProps) {
  const visibleTabs = TABS.filter((t) => !t.adminOnly || showAssignmentsTab);
  const [activeTab, setActiveTab] = useState<TabId>("progress");

  return (
    <div className="card p-0">
      <div className="flex border-b border-border overflow-x-auto">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === "progress" && (
          <div className="space-y-6">
            <ProgressMap studentId={studentId} />
            {initMemValue.length > 0 && (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium">الحفظ السابق قبل الانضمام</p>
                <InitialMemorizationGrid value={initMemValue} readOnly />
              </div>
            )}
          </div>
        )}

        {activeTab === "sessions" && (
          <StudentSessionsTab studentId={studentId} />
        )}

        {activeTab === "attendance" && (
          <StudentAttendanceTab studentId={studentId} />
        )}

        {activeTab === "ijazat" && (
          <StudentIjazatTab studentId={studentId} isAdmin={isAdmin} />
        )}

        {activeTab === "assignments" && showAssignmentsTab && (
          assignmentHistory.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">
              لا يوجد سجل إسناد لهذا الطالب
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary text-right">
                    <th className="px-4 py-3 font-medium">المحفظ</th>
                    <th className="px-4 py-3 font-medium">تاريخ البداية</th>
                    <th className="px-4 py-3 font-medium">تاريخ النهاية</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assignmentHistory.map((a) => (
                    <tr key={a.id} className="hover:bg-secondary/50 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/admin/teachers/${a.teacher_id}`}
                          className="text-primary hover:underline"
                        >
                          {a.teacher_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {new Date(a.start_date).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-4 py-3">
                        {a.end_date
                          ? new Date(a.end_date).toLocaleDateString("ar-EG")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.is_active
                              ? "bg-[#dcfce7] text-[#166534]"
                              : "bg-[#f3f4f6] text-[#374151]"
                          }`}
                        >
                          {a.is_active ? "نشط" : "منتهٍ"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
