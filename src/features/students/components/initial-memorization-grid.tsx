"use client";

import { useState } from "react";
import { CheckSquare, Square } from "lucide-react";

export interface JuzEntry {
  juz_number: number;
  status: "memorized" | "with_ijaza";
  sheikh_name?: string;
}

type InitialMemorizationGridProps =
  | {
      value: JuzEntry[];
      readOnly: true;
      onChange?: never;
    }
  | {
      value: JuzEntry[];
      readOnly?: false;
      onChange: (entries: JuzEntry[]) => void;
    };

const JUZ_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

export function InitialMemorizationGrid({ value, onChange, readOnly = false }: InitialMemorizationGridProps) {
  const [expandedJuz, setExpandedJuz] = useState<number | null>(null);

  const getEntry = (juz: number): JuzEntry | undefined =>
    value.find((e) => e.juz_number === juz);

  const toggleJuz = (juz: number) => {
    if (readOnly) return;
    const existing = getEntry(juz);
    if (existing) {
      onChange?.(value.filter((e) => e.juz_number !== juz));
      if (expandedJuz === juz) setExpandedJuz(null);
    } else {
      onChange?.([...value, { juz_number: juz, status: "memorized", sheikh_name: undefined }]);
      setExpandedJuz(juz);
    }
  };

  const updateEntry = (juz: number, updates: Partial<JuzEntry>) => {
    if (readOnly) return;
    onChange?.(
      value.map((e) => (e.juz_number === juz ? { ...e, ...updates } : e))
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-10">
        {JUZ_NUMBERS.map((juz) => {
          const entry = getEntry(juz);
          const checked = !!entry;
          const isIjaza = entry?.status === "with_ijaza";

          return (
            <button
              key={juz}
              type="button"
              onClick={() => {
                if (readOnly) {
                  setExpandedJuz(expandedJuz === juz ? null : juz);
                  return;
                }
                if (!checked) {
                  toggleJuz(juz);
                } else {
                  setExpandedJuz(expandedJuz === juz ? null : juz);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all",
                checked
                  ? isIjaza
                    ? "border-[#16a34a] bg-[#dcfce7] text-[#166534]"
                    : "border-[#2563eb] bg-[#dbeafe] text-[#1e40af]"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
                readOnly && "cursor-default"
              )}
            >
              <span className="text-xs font-bold">{juz}</span>
              {!readOnly && (
                <span className="mt-0.5">
                  {checked ? (
                    <CheckSquare className="size-3" />
                  ) : (
                    <Square className="size-3 opacity-40" />
                  )}
                </span>
              )}
              {checked && (
                <span className="mt-0.5 text-[10px]">{isIjaza ? "إجازة" : "حفظ"}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded juz options */}
      {!readOnly && expandedJuz !== null && getEntry(expandedJuz) && (
        <div className="rounded-lg border border-border bg-secondary p-3 space-y-3">
          <p className="text-sm font-medium">الجزء {expandedJuz}</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`status-${expandedJuz}`}
                value="memorized"
                checked={getEntry(expandedJuz)?.status === "memorized"}
                onChange={() => updateEntry(expandedJuz, { status: "memorized", sheikh_name: undefined })}
              />
              <span className="text-sm">حفظ</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`status-${expandedJuz}`}
                value="with_ijaza"
                checked={getEntry(expandedJuz)?.status === "with_ijaza"}
                onChange={() => updateEntry(expandedJuz, { status: "with_ijaza" })}
              />
              <span className="text-sm">إجازة</span>
            </label>
          </div>
          {getEntry(expandedJuz)?.status === "with_ijaza" && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">
                اسم الشيخ المُجيز <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="اسم الشيخ"
                value={getEntry(expandedJuz)?.sheikh_name ?? ""}
                onChange={(e) => updateEntry(expandedJuz, { sheikh_name: e.target.value })}
              />
            </div>
          )}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setExpandedJuz(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={() => toggleJuz(expandedJuz)}
              className="text-xs text-destructive hover:underline"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {value.length === 0
          ? "لم يتم تحديد أي جزء — اضغط على الأجزاء المحفوظة قبل الانضمام"
          : `${value.length} جزء محدد`}
      </p>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
