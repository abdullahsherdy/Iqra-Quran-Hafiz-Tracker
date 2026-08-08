"use client";

import { useState, useEffect, Fragment } from "react";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  method: string;
  path: string;
  status_code: number;
  request_body: unknown;
  response_body: unknown;
  created_at: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  count: number;
  page: number;
  pageSize: number;
}

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
};

const ENTITY_LABELS: Record<string, string> = {
  student: "طالب",
  teacher: "محفظ",
  admin: "مشرف",
  session: "جلسة",
  ijaza: "إجازة",
};

export default function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageSize = 50;
  const totalPages = Math.ceil(count / pageSize);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      try {
        const data = await apiGet<AuditLogResponse>(
          `/api/audit-logs?page=${page}&page_size=${pageSize}`,
        );
        setLogs(data.data);
        setCount(data.count);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "حدث خطأ");
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [page]);

  if (loading && logs.length === 0) return <p className="text-muted-foreground">جاري التحميل...</p>;
  if (error) return <p className="text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="size-5 text-primary" />
        <h1 className="text-xl font-bold">سجل العمليات</h1>
      </div>
      <p className="text-sm text-muted-foreground">{count} عملية مسجلة</p>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50">
              <tr>
                <th className="px-3 py-2 text-right font-medium">المستخدم</th>
                <th className="px-3 py-2 text-right font-medium">العملية</th>
                <th className="px-3 py-2 text-right font-medium">النوع</th>
                <th className="px-3 py-2 text-right font-medium">المسار</th>
                <th className="px-3 py-2 text-right font-medium">الحالة</th>
                <th className="px-3 py-2 text-right font-medium">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-secondary/30"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-3 py-2">{log.username ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={
                        log.action === "create" ? "text-green-600" :
                        log.action === "delete" ? "text-red-600" :
                        "text-blue-600"
                      }>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</td>
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{log.method} {log.path}</td>
                    <td className="px-3 py-2">
                      <span className={log.status_code < 400 ? "text-green-600" : "text-red-600"}>
                        {log.status_code}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr className="border-b border-border bg-secondary/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-2">
                          {log.request_body != null && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">المدخلات:</p>
                              <pre className="bg-background rounded p-2 text-xs overflow-x-auto" dir="ltr">
                                {JSON.stringify(log.request_body, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.response_body != null && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">المخرجات:</p>
                              <pre className="bg-background rounded p-2 text-xs overflow-x-auto" dir="ltr">
                                {JSON.stringify(log.response_body, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    لا توجد عمليات مسجلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="btn-secondary p-2 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="btn-secondary p-2 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
