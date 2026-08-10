"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UserCog, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiDelete, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface AdminUser {
  id: string;
  name: string;
  username: string;
  role: string;
  phone: string | null;
  gender: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export default function AdminsListClient() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  async function fetchAdmins() {
    try {
      const data = await apiGet<AdminUser[]>("/api/admins");
      setAdmins(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Data-fetching effect: fetchAdmins calls setState internally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAdmins();
  }, []);

  async function handleDelete(admin: AdminUser) {
    setDeleteTarget(admin);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteTarget(null);
    try {
      await apiDelete(`/api/admins/${deleteTarget.id}`);
      await fetchAdmins();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "حدث خطأ");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">جاري التحميل...</p>;
  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">المشرفون</h1>
        <Link href="/admin/admins/new" className="btn-primary text-sm">
          <Plus className="size-4 inline" /> مشرف جديد
        </Link>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50">
              <tr>
                <th className="px-4 py-2 text-right font-medium">الاسم</th>
                <th className="px-4 py-2 text-right font-medium">اسم المستخدم</th>
                <th className="px-4 py-2 text-right font-medium">الصلاحية</th>
                <th className="px-4 py-2 text-right font-medium">الهاتف</th>
                <th className="px-4 py-2 text-right font-medium">الحالة</th>
                <th className="px-4 py-2 text-right font-medium">إجراءات</th>
              </tr>
            </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{admin.name}</td>
                <td className="px-4 py-2" dir="ltr">{admin.username}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1">
                    <UserCog className="size-3 text-primary" />
                    {admin.role === "super_admin" ? "المشرف العام" : "مشرف"}
                  </span>
                </td>
                <td className="px-4 py-2" dir="ltr">{admin.phone ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={admin.is_active ? "text-green-600" : "text-muted-foreground"}>
                    {admin.is_active ? "نشط" : "معطل"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {admin.role !== "super_admin" ? (
                      <>
                        <Link
                          href={`/admin/admins/${admin.id}/edit`}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="تعديل"
                        >
                          <Pencil className="size-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(admin)}
                          disabled={deletingId === admin.id}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="حذف"
                        >
                          {deletingId === admin.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  لا يوجد مشرفون
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف المشرف"
        message={deleteTarget ? `هل أنت متأكد من حذف المشرف "${deleteTarget.name}"؟` : ""}
        confirmLabel="حذف"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
