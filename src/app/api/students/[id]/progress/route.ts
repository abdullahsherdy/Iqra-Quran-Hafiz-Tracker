import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";
import { getApiAppUser, canAccessStudent } from "@/lib/auth/student-access";
import { computeJuzProgressPure } from "@/lib/progress";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/students/[id]/progress — detailed progress map data
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: studentId } = await params;
  const supabase = await createSupabaseServerComponentClient();
  if (!supabase) return Response.json({ error: "Config missing" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Config missing" }, { status: 500 });

  const appUser = await getApiAppUser(admin, user.id);
  if (!appUser || !appUser.is_active) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (!(await canAccessStudent(admin, appUser, studentId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load all required data in parallel
  const [boundariesRes, sessionsRes, initialMemRes, ijazatRes, surahsRes] = await Promise.all([
    admin
      .from("juz_boundaries")
      .select("juz_number, surah_id, from_ayah, to_ayah"),
    admin
      .from("sessions")
      .select("id, session_date, session_type, surah_id, from_ayah, to_ayah, rating, notes, users!sessions_teacher_id_fkey(name)")
      .eq("student_id", studentId),
    admin
      .from("initial_memorization")
      .select("juz_number, status")
      .eq("student_id", studentId),
    admin
      .from("ijazat")
      .select("ijaza_type, juz_number")
      .eq("student_id", studentId),
    admin
      .from("surahs")
      .select("id, name_arabic"),
  ]);

  if (boundariesRes.error) return Response.json({ error: boundariesRes.error.message }, { status: 500 });
  if (sessionsRes.error) return Response.json({ error: sessionsRes.error.message }, { status: 500 });
  if (initialMemRes.error) return Response.json({ error: initialMemRes.error.message }, { status: 500 });
  if (ijazatRes.error) return Response.json({ error: ijazatRes.error.message }, { status: 500 });
  if (surahsRes.error) return Response.json({ error: surahsRes.error.message }, { status: 500 });

  const boundaries = boundariesRes.data;
  const sessions = sessionsRes.data;
  const initialMem = initialMemRes.data;
  const ijazat = ijazatRes.data;
  const surahs = surahsRes.data;

  // Build surah map for name lookup
  const surahMap = new Map<number, string>();
  for (const s of surahs) {
    surahMap.set(s.id, s.name_arabic);
  }

  // Calculate baseline progress using pure helper
  const progressList = computeJuzProgressPure({
    boundaries,
    sessions: sessions.map(s => ({
      session_date: s.session_date,
      session_type: s.session_type,
      surah_id: s.surah_id,
      from_ayah: s.from_ayah,
      to_ayah: s.to_ayah,
      rating: s.rating
    })),
    initialMem,
    ijazat,
    referenceDate: new Date()
  });

  // Map initial memorization status
  const initMemMap = new Map<number, string>();
  for (const row of initialMem) {
    initMemMap.set(row.juz_number, row.status);
  }

  // Now enrich each juz progress with detailed breakdown
  const boundariesByJuz = new Map<number, typeof boundaries>();
  for (const row of boundaries) {
    let list = boundariesByJuz.get(row.juz_number);
    if (!list) {
      list = [];
      boundariesByJuz.set(row.juz_number, list);
    }
    list.push(row);
  }

  const enrichedProgress = progressList.map((progress) => {
    const juz = progress.juz;
    const segments = boundariesByJuz.get(juz) ?? [];
    
    // Group segments by surah
    const segmentsBySurah = new Map<number, typeof segments>();
    for (const seg of segments) {
      let list = segmentsBySurah.get(seg.surah_id);
      if (!list) {
        list = [];
        segmentsBySurah.set(seg.surah_id, list);
      }
      list.push(seg);
    }

    const isInitiallyCovered = initMemMap.has(juz);

    // Compute per-surah coverage
    const surahCoverage = Array.from(segmentsBySurah.entries()).map(([surahId, segs]) => {
      let totalSegAyahs = 0;
      for (const seg of segs) {
        totalSegAyahs += (seg.to_ayah - seg.from_ayah + 1);
      }

      const coveredRanges: [number, number][] = [];
      for (const seg of segs) {
        if (isInitiallyCovered) {
          coveredRanges.push([seg.from_ayah, seg.to_ayah]);
        } else {
          const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
          for (const sess of surahSessions) {
            const start = Math.max(sess.from_ayah, seg.from_ayah);
            const end = Math.min(sess.to_ayah, seg.to_ayah);
            if (start <= end) {
              coveredRanges.push([start, end]);
            }
          }
        }
      }

      // Union ranges
      let coveredSegAyahs = 0;
      if (coveredRanges.length > 0) {
        coveredRanges.sort((a, b) => a[0] - b[0]);
        const unioned: [number, number][] = [];
        let current = { ...coveredRanges[0] };
        let curStart = current[0];
        let curEnd = current[1];

        for (let i = 1; i < coveredRanges.length; i++) {
          const next = coveredRanges[i];
          if (next[0] <= curEnd + 1) {
            curEnd = Math.max(curEnd, next[1]);
          } else {
            unioned.push([curStart, curEnd]);
            curStart = next[0];
            curEnd = next[1];
          }
        }
        unioned.push([curStart, curEnd]);

        for (const [f, t] of unioned) {
          coveredSegAyahs += (t - f + 1);
        }
      }

      const surahPercent = totalSegAyahs > 0 ? (coveredSegAyahs / totalSegAyahs) * 100 : 0;

      return {
        surah_id: surahId,
        surah_name: surahMap.get(surahId) || "",
        total_ayahs: totalSegAyahs,
        covered_ayahs: coveredSegAyahs,
        coverage_percent: Math.round(surahPercent * 10) / 10,
      };
    });

    // Find sessions intersecting this juz
    const juzSessionsList: any[] = [];
    for (const seg of segments) {
      const surahSessions = sessions.filter((s) => s.surah_id === seg.surah_id);
      for (const sess of surahSessions) {
        const start = Math.max(sess.from_ayah, seg.from_ayah);
        const end = Math.min(sess.to_ayah, seg.to_ayah);
        if (start <= end) {
          const teacher = sess.users as unknown as { name: string } | null;
          juzSessionsList.push({
            id: sess.id,
            session_date: sess.session_date,
            session_type: sess.session_type,
            rating: sess.rating,
            notes: sess.notes,
            from_ayah: sess.from_ayah,
            to_ayah: sess.to_ayah,
            surah_name: surahMap.get(sess.surah_id) || "",
            teacher_name: teacher?.name ?? "",
          });
        }
      }
    }

    // Sort sessions descending by date
    juzSessionsList.sort((a, b) => b.session_date.localeCompare(a.session_date));

    const lastSessionDate = juzSessionsList.length > 0 ? juzSessionsList[0].session_date : null;

    return {
      ...progress,
      surahs: surahCoverage,
      sessions: juzSessionsList,
      lastSessionDate,
    };
  });

  return Response.json(enrichedProgress);
}
