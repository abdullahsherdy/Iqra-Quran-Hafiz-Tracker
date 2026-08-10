"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, Trash2, Loader2, Award } from "lucide-react";
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
  students:
    | { id: string; name: string; gender: string }
    | { id: string; name: string; gender: string }[]
    | null;
}

interface AdminIjazatTableProps {
  ijazat: IjazaRow[];
}

function resolveStudent(row: IjazaRow) {
  return Array.isArray(row.students) ? row.students[0] ?? null : row.students;
}

function IjazaTypeBadge({ type, juzNumber }: { type: "juz" | "full_quran"; juzNumber: number | null }) {
  if (type === "full_quran") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        <Star className="size-3 fill-amber-700" />
        ختم القرآن
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      <Award className="size-3" />
      جزء {toArabicNumerals(juzNumber ?? "")}
    </span>
  );
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
    <>
      {/* Desktop / tablet: table view (hidden on mobile) */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
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
              const student = resolveStudent(row);
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
                    <IjazaTypeBadge type={row.ijaza_type} juzNumber={row.juz_number} />
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

      {/* Mobile: card view (hidden on sm+) */}
      <div className="sm:hidden space-y-3">
        {rows.map((row) => {
          const student = resolveStudent(row);
          return (
            <div
              key={row.id}
              className="card space-y-3 border border-border shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                {student ? (
                  <Link
                    href={`/admin/students/${student.id}`}
                    className="text-primary font-semibold text-sm hover:underline"
                  >
                    {student.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
                <button
                  type="button"
                  disabled={revokingId === row.id}
                  onClick={() => handleRevoke(row.id)}
                  className="text-destructive hover:text-red-700 disabled:opacity-50 p-1 rounded-md hover:bg-red-50 transition-colors shrink-0"
                  title="إلغاء الإجازة"
                >
                  {revokingId === row.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IjazaTypeBadge type={row.ijaza_type} juzNumber={row.juz_number} />
                <span className="text-xs text-muted-foreground">
                  {new Date(row.ijaza_date).toLocaleDateString("ar-EG")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>
                  <span className="text-foreground/70">الشيخ:</span> {row.sheikh_name}
                </p>
                {row.notes && (
                  <p className="line-clamp-2">
                    <span className="text-foreground/70">ملاحظات:</span> {row.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
