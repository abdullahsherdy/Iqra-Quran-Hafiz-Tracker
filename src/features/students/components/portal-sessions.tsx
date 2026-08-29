import { Calendar, BookOpen } from "lucide-react";

import {
  RatingBadge,
  SessionTypeBadge,
  type Rating,
  type SessionType,
} from "@/components/badges";
import { toArabicNumerals, formatSurahLabel } from "@/lib/arabic";
import type { StudentSessionRow } from "@/features/students/server/sessions-read";

/**
 * Read-only session history for the student portal. Renders the same session
 * data the staff profile shows, but with NO edit / delete / record controls —
 * the portal is strictly read-only.
 */
export function PortalSessions({ sessions }: { sessions: StudentSessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-muted-foreground">
        <Calendar className="size-8 mx-auto mb-2 opacity-40" />
        <p>لا توجد جلسات مسجلة بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div key={session.id} className="card space-y-3 p-4">
          {/* Session header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="size-4 text-primary" />
              <span>{new Date(session.session_date).toLocaleDateString("ar-EG")}</span>
            </div>
            <div className="flex items-center gap-2">
              {session.overall_rating && (
                <RatingBadge value={session.overall_rating as Rating} />
              )}
              {session.teacher_name && (
                <span className="text-xs text-muted-foreground">
                  المحفّظ: {session.teacher_name}
                </span>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {session.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/60 bg-secondary/15 p-3 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    <span>
                      {item.surah_name
                        ? formatSurahLabel(item.surah_id, item.surah_name)
                        : `سورة ${toArabicNumerals(item.surah_id)}`}
                    </span>
                    <span className="text-muted-foreground">
                      من آية {toArabicNumerals(item.from_ayah)} إلى{" "}
                      {toArabicNumerals(item.to_ayah)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SessionTypeBadge value={item.session_type as SessionType} />
                    <RatingBadge value={item.rating as Rating} />
                  </div>
                </div>
                {item.pages ? (
                  <p className="text-muted-foreground">
                    {toArabicNumerals(item.pages)} صفحة
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="rounded bg-secondary/35 p-1.5 text-[11px] text-muted-foreground">
                    {item.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Session-level notes */}
          {session.notes ? (
            <p className="rounded-md bg-secondary/25 p-2 text-xs text-muted-foreground">
              {session.notes}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
