import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { join } from "path";
import type { ParentReportData } from "@/features/reports/server/generate-parent-report";

// Register Amiri Arabic TTF font (TTF required by @react-pdf/renderer)
const fontsDir = join(process.cwd(), "public", "fonts");
Font.register({
  family: "Amiri",
  fonts: [
    { src: join(fontsDir, "Amiri-Regular.ttf"), fontWeight: "normal" },
    { src: join(fontsDir, "Amiri-Bold.ttf"), fontWeight: "bold" },
  ],
});

// @react-pdf/textkit includes bidi-js + fontkit OpenType shaping (GSUB/GPOS)
// which natively handles Arabic contextual forms and bidi reordering.
// Pass raw Arabic text; set direction: "rtl" on styles for correct base direction.

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    padding: 30,
    fontSize: 10,
    fontFamily: "Amiri",
    direction: "rtl",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    marginBottom: 15,
  },
  appName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2563eb",
    textAlign: "right",
  },
  reportDate: {
    fontSize: 9,
    color: "#666",
    textAlign: "right",
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 15,
    color: "#1f2937",
  },
  studentInfo: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
  },
  infoItem: {
    fontSize: 10,
    color: "#374151",
    textAlign: "right",
  },
  infoLabel: {
    fontWeight: "bold",
    color: "#6b7280",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    textAlign: "right",
  },
  summaryBox: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 15,
  },
  summaryCard: {
    flex: 1,
    minWidth: 80,
    padding: 8,
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bae6fd",
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2563eb",
  },
  summaryLabel: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2,
  },
  table: {
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#e5e7eb",
    padding: 6,
    fontSize: 9,
    fontWeight: "bold",
    color: "#374151",
  },
  tableRow: {
    flexDirection: "row-reverse",
    padding: 6,
    fontSize: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    color: "#374151",
  },
  colDate: { flex: 1.2, textAlign: "right" },
  colSurah: { flex: 1.5, textAlign: "right" },
  colAyah: { flex: 1.5, textAlign: "right" },
  colType: { flex: 1, textAlign: "right" },
  colRating: { flex: 1, textAlign: "right" },
  colPages: { flex: 0.8, textAlign: "right" },
  colTeacher: { flex: 1.2, textAlign: "right" },
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
  emptyState: {
    padding: 20,
    textAlign: "center",
    fontSize: 10,
    color: "#9ca3af",
  },
  ijazaItem: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 3,
    textAlign: "right",
  },
});

const RATING_LABELS: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  weak: "ضعيف",
};

const TYPE_LABELS: Record<string, string> = {
  new_memorization: "تسميع جديد",
  review: "مراجعة",
};

function formatDateArabic(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function ParentReportDocument({ data }: { data: ParentReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>اقرأ — تقرير ولي الأمر</Text>
          <Text style={styles.reportDate}>
            تاريخ التقرير: {formatDateArabic(data.generatedAt)}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          تقرير الحفظ والمراجعة — {data.periodLabel}
        </Text>

        {/* Student Info */}
        <View style={styles.studentInfo}>
          <Text style={styles.infoItem}>
            اسم الطالب: {data.studentName}
          </Text>
          <Text style={styles.infoItem}>
            ولي الأمر: {data.guardianName}
          </Text>
          <Text style={styles.infoItem}>
            تاريخ الانضمام: {formatDateArabic(data.enrollmentDate)}
          </Text>
          <Text style={styles.infoItem}>
            المستوى: {data.levelLabel}
          </Text>
          <Text style={styles.infoItem}>
            الأجزاء المحفوظة: {data.memorizedJuzCount} / 30
          </Text>
          <Text style={styles.infoItem}>
            الإجازات: {data.ijazaJuzCount}
          </Text>
        </View>

        {/* Summary Cards */}
        <Text style={styles.sectionTitle}>
          ملخص الفترة ({data.periodLabel})
        </Text>
        <View style={styles.summaryBox}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{data.totalSessions}</Text>
            <Text style={styles.summaryLabel}>عدد الجلسات</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{data.totalPages}</Text>
            <Text style={styles.summaryLabel}>عدد الصفحات</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{data.attendanceDays}</Text>
            <Text style={styles.summaryLabel}>أيام الحضور</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{data.memorizedJuzCount}</Text>
            <Text style={styles.summaryLabel}>الأجزاء المحفوظة</Text>
          </View>
        </View>

        {/* Session Log Table */}
        <Text style={styles.sectionTitle}>سجل الجلسات</Text>
        {data.sessions.length === 0 ? (
          <Text style={styles.emptyState}>لا توجد جلسات في هذه الفترة</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colDate}>التاريخ</Text>
              <Text style={styles.colSurah}>السورة</Text>
              <Text style={styles.colAyah}>الآيات</Text>
              <Text style={styles.colType}>النوع</Text>
              <Text style={styles.colRating}>التقييم</Text>
              <Text style={styles.colPages}>الصفحات</Text>
              <Text style={styles.colTeacher}>المحفظ</Text>
            </View>
            {data.sessions.map((sess, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.colDate}>{formatDateArabic(sess.session_date)}</Text>
                <Text style={styles.colSurah}>{sess.surah_name}</Text>
                <Text style={styles.colAyah}>
                  {sess.from_ayah} - {sess.to_ayah}
                </Text>
                <Text style={styles.colType}>
                  {TYPE_LABELS[sess.session_type] ?? sess.session_type}
                </Text>
                <Text style={styles.colRating}>
                  {RATING_LABELS[sess.rating] ?? sess.rating}
                </Text>
                <Text style={styles.colPages}>{sess.pages ?? "-"}</Text>
                <Text style={styles.colTeacher}>{sess.teacher_name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Ijazat */}
        {data.ijazat.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>الإجازات</Text>
            {data.ijazat.map((ij, i) => (
              <Text key={i} style={styles.ijazaItem}>
                {ij.ijaza_type === "full_quran"
                  ? "القرآن كاملاً"
                  : `جزء ${ij.juz_number}`}
                {` — الشيخ: ${ij.sheikh_name} — ${formatDateArabic(ij.ijaza_date)}`}
              </Text>
            ))}
          </View>
        )}

        {/* Initial Memorization */}
        {data.initialMemorization.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.sectionTitle}>
              الحفظ السابق قبل الانضمام
            </Text>
            {data.initialMemorization.map((im, i) => (
              <Text key={i} style={styles.ijazaItem}>
                {`جزء ${im.juz_number}: ${im.status === "with_ijaza" ? "بإجازة" : "محفوظ"}`}
                {im.sheikh_name ? ` — الشيخ: ${im.sheikh_name}` : ""}
                {im.pages ? ` — ${im.pages} صفحة` : ""}
              </Text>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            تم إنشاء هذا التقرير بواسطة {data.generatedBy} — {formatDateArabic(data.generatedAt)}
          </Text>
          <Text>اقرأ — نظام متابعة حفظ القرآن الكريم</Text>
        </View>
      </Page>
    </Document>
  );
}

export { ParentReportDocument };
