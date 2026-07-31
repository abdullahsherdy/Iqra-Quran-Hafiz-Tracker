"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Trash2, Loader2 } from "lucide-react";
import { toArabicNumerals } from "@/lib/arabic";
import { apiDelete, ApiError } from "@/lib/api-client";

interface IjazaRow {
  id: string;
  ijaza_type: "juz" | "full_quran";
  juz_number: number | null;
  sheikh_name: string;
  ijaza_date: string;
  notes: string | null;
  created_at: string;
  // Supabase returns nested one-to-one as array in JS
  students: { id: string; name: string; gender: string } | { id: string; name: string; gender: string }[] | null;
}

interface AdminIjazatTableProps {
  ijazat: IjazaRow[];
}

export function AdminIjazatTable({ ijazat: initial }: AdminIjazatTableProps) {
  const [rows, setRows] = useState<IjazaRow[]>(initial);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    if (
      !window.confirm(
        "هل أنت متأكد من إلغاء هذه الإجازة؟ سيتم إعادة حساب تقدم الطالب."
      )
    )
      return;

    setRevokingId(id);
    try {
      await apiDelete(`/api/ijazat/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "حدث خطأ في الاتصال");
    } finally {
      setRevokingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card text-center py-12 text-sm text-muted-foreground border-dashed">
        لا توجد إجازات مسجلة بعد.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary text-right">
            <th className="px-4 py-3 font-medium">الطالب</th>
            <th className="px-4 py-3 font-medium">نوع الإجازة</th>
            <th className="px-4 py-3 font-medium">الشيخ / المجيز</th>
            <th className="px-4 py-3 font-medium">التاريخ</th>
            <th className="px-4 py-3 font-medium">ملاحظات</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            // Supabase may return the nested relation as array or single object
            const student = Array.isArray(row.students)
              ? row.students[0] ?? null
              : row.students;
            return (
              <tr
                key={row.id}
                className="hover:bg-secondary/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium">
                  {student ? (
                    <Link
                      href={`/admin/students/${student.id}`}
                      className="text-primary hover:underline"
                    >
                      {student.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      row.ijaza_type === "full_quran"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {row.ijaza_type === "full_quran" ? (
                      <>
                        <Star className="size-3 fill-amber-700" />
                        ختم القرآن
                      </>
                    ) : (
                      <>جزء {toArabicNumerals(row.juz_number ?? "")}</>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.sheikh_name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(row.ijaza_date).toLocaleDateString("ar-EG")}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">
                  {row.notes || "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={revokingId === row.id}
                    onClick={() => handleRevoke(row.id)}
                    className="text-destructive hover:text-red-700 disabled:opacity-50 p-1 rounded-md hover:bg-red-50 transition-colors"
                    title="إلغاء الإجازة"
                  >
                    {revokingId === row.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
