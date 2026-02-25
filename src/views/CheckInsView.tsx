import { useState, useMemo } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import type { AppLanguage, SymptomCheckIn } from "../types";
import { trLocale } from "../i18n";

// ─── Emoji scale helpers ─────────────────────────────────────────────────────

const SCORE_EMOJIS: Record<number, string> = {
  1: "😫", 2: "😩", 3: "😟", 4: "😕", 5: "😐",
  6: "🙂", 7: "😊", 8: "😄", 9: "😁", 10: "🤩"
};

function scoreToEmoji(score: number | null): string {
  if (score === null) return "—";
  return SCORE_EMOJIS[Math.round(score)] ?? "😐";
}

const averageScore = (checkIn: SymptomCheckIn): number | null => {
  const values = [checkIn.energy, checkIn.mood, checkIn.sleep, checkIn.libido, checkIn.motivation].filter(
    (value): value is number => value !== null
  );
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

// ─── Metric config ────────────────────────────────────────────────────────────

interface MetricConfig {
  key: keyof Pick<SymptomCheckIn, "energy" | "libido" | "mood" | "sleep" | "motivation">;
  labelNl: string;
  labelEn: string;
  icon: string;
  color: string;
}

const METRICS: MetricConfig[] = [
  { key: "energy",     labelNl: "Energie",     labelEn: "Energy",     icon: "⚡", color: "#06b6d4" },
  { key: "mood",       labelNl: "Stemming",     labelEn: "Mood",       icon: "💭", color: "#a855f7" },
  { key: "sleep",      labelNl: "Slaap",        labelEn: "Sleep",      icon: "🌙", color: "#3b82f6" },
  { key: "libido",     labelNl: "Libido",       labelEn: "Libido",     icon: "❤️", color: "#ec4899" },
  { key: "motivation", labelNl: "Motivatie",    labelEn: "Motivation", icon: "🎯", color: "#f97316" }
];

// ─── Emoji Slider ─────────────────────────────────────────────────────────────

interface EmojiSliderProps {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  icon: string;
  color: string;
}

const EmojiSlider = ({ value, onChange, label, icon, color }: EmojiSliderProps) => {
  const current = value ?? 5;
  const emoji = scoreToEmoji(current);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-300">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-2xl leading-none">{emoji}</span>
          <span className="w-6 text-right text-sm font-semibold text-slate-200">{current}</span>
        </span>
      </div>
      <div className="relative flex items-center">
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="checkin-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 outline-none"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${(current - 1) / 9 * 100}%, #334155 ${(current - 1) / 9 * 100}%, #334155 100%)`
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>😫 1</span>
        <span>10 🤩</span>
      </div>
    </div>
  );
};

// ─── Check-in form ────────────────────────────────────────────────────────────

interface CheckInFormProps {
  initial?: SymptomCheckIn;
  onSave: (data: Omit<SymptomCheckIn, "id">) => void;
  onCancel: () => void;
  language: AppLanguage;
}

const CheckInForm = ({ initial, onSave, onCancel, language }: CheckInFormProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate]         = useState(initial?.date ?? today);
  const [energy, setEnergy]     = useState<number | null>(initial?.energy ?? 5);
  const [mood, setMood]         = useState<number | null>(initial?.mood ?? 5);
  const [sleep, setSleep]       = useState<number | null>(initial?.sleep ?? 5);
  const [libido, setLibido]     = useState<number | null>(initial?.libido ?? 5);
  const [motivation, setMotivation] = useState<number | null>(initial?.motivation ?? 5);
  const [notes, setNotes]       = useState(initial?.notes ?? "");

  const setters: Record<string, (v: number) => void> = {
    energy: setEnergy, mood: setMood, sleep: setSleep,
    libido: setLibido, motivation: setMotivation
  };
  const values: Record<string, number | null> = { energy, mood, sleep, libido, motivation };

  const handleSave = () => {
    onSave({ date, energy, mood, sleep, libido, motivation, notes });
  };

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
      {/* Date */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          {tr("Datum", "Date")}
        </label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Sliders */}
      <div className="mb-5 flex flex-col gap-5">
        {METRICS.map((m) => (
          <EmojiSlider
            key={m.key}
            value={values[m.key] as number | null}
            onChange={setters[m.key]}
            label={trLocale(language, m.labelNl, m.labelEn)}
            icon={m.icon}
            color={m.color}
          />
        ))}
      </div>

      {/* Notes */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          {tr("Notities (optioneel)", "Notes (optional)")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={tr("Hoe voelde je je vandaag?", "How were you feeling today?")}
          className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/30"
        >
          {tr("Opslaan", "Save check-in")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
        >
          {tr("Annuleren", "Cancel")}
        </button>
      </div>
    </div>
  );
};

// ─── History card ─────────────────────────────────────────────────────────────

interface CheckInCardProps {
  checkIn: SymptomCheckIn;
  onEdit: () => void;
  onDelete: () => void;
  language: AppLanguage;
  isEditing: boolean;
  onSaveEdit: (data: Omit<SymptomCheckIn, "id">) => void;
  onCancelEdit: () => void;
}

const CheckInCard = ({
  checkIn, onEdit, onDelete, language, isEditing, onSaveEdit, onCancelEdit
}: CheckInCardProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avg = averageScore(checkIn);

  if (isEditing) {
    return <CheckInForm initial={checkIn} onSave={onSaveEdit} onCancel={onCancelEdit} language={language} />;
  }

  return (
    <div className="h-full rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/55 to-slate-900/35 p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-100">
            {format(parseISO(checkIn.date), "d MMM yyyy")}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {avg === null
              ? tr("Geen complete score", "No complete score")
              : tr("Gemiddelde", "Average")} {avg === null ? "—" : avg.toFixed(1)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-300">
          {avg === null ? "—" : `${scoreToEmoji(Math.round(avg))} ${Math.round(avg)}/10`}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {METRICS.map((m) => {
          const val = checkIn[m.key];
          return (
            <span
              key={m.key}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-300"
            >
              <span className="text-[13px] leading-none">{m.icon}</span>
              <span className="text-slate-400">{trLocale(language, m.labelNl, m.labelEn)}</span>
              <span className="font-semibold text-slate-100">{val ?? "—"}</span>
            </span>
          );
        })}
      </div>

      {checkIn.notes ? (
        <p className="mt-2.5 border-t border-slate-700/60 pt-2.5 text-sm text-slate-300 italic">
          {checkIn.notes}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
        >
          {tr("Bewerk", "Edit")}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/30"
            >
              {tr("Verwijder", "Delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800"
            >
              {tr("Annuleer", "Cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-md px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-red-400"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Trend chart ──────────────────────────────────────────────────────────────

interface TrendChartProps {
  checkIns: SymptomCheckIn[];
  language: AppLanguage;
}

const TrendChart = ({ checkIns, language }: TrendChartProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const data = checkIns
    .filter(
      (c) =>
        c.energy !== null ||
        c.mood !== null ||
        c.sleep !== null ||
        c.libido !== null ||
        c.motivation !== null
    )
    .map((c) => ({
      date: format(parseISO(c.date), "d MMM"),
      energy: c.energy,
      mood: c.mood,
      sleep: c.sleep,
      libido: c.libido,
      motivation: c.motivation
    }));

  if (data.length < 2) return null;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {tr("Trend over tijd", "Trend over time")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {tr(
            "Snel overzicht van hoe je welzijn zich ontwikkelt per check-in.",
            "Quick view of how your wellbeing changes across check-ins."
          )}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" />
          <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fontSize: 11, fill: "#64748b" }} width={26} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
          {METRICS.map((m) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.key}
              name={trLocale(language, m.labelNl, m.labelEn)}
              stroke={m.color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: m.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Main view ────────────────────────────────────────────────────────────────

interface CheckInsViewProps {
  checkIns: SymptomCheckIn[];
  language: AppLanguage;
  isShareMode: boolean;
  onAdd: (data: Omit<SymptomCheckIn, "id">) => void;
  onUpdate: (id: string, data: Partial<SymptomCheckIn>) => void;
  onDelete: (id: string) => void;
}

const CheckInsView = ({
  checkIns,
  language,
  isShareMode,
  onAdd,
  onUpdate,
  onDelete
}: CheckInsViewProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const sorted = useMemo(
    () => [...checkIns].sort((a, b) => b.date.localeCompare(a.date)),
    [checkIns]
  );

  const displayedHistory = showAllHistory ? sorted : sorted.slice(0, 6);
  const lastCheckIn = sorted[0] ?? null;
  const daysSinceLast = lastCheckIn
    ? differenceInDays(new Date(), parseISO(lastCheckIn.date))
    : null;

  const handleAdd = (data: Omit<SymptomCheckIn, "id">) => {
    onAdd(data);
    setShowForm(false);
  };

  const handleUpdate = (id: string, data: Omit<SymptomCheckIn, "id">) => {
    onUpdate(id, data);
    setEditingId(null);
  };

  const statusLabel = (() => {
    if (daysSinceLast === null) return tr("Nog geen check-ins", "No check-ins yet");
    if (daysSinceLast === 0) return tr("Vandaag ingecheckt", "Checked in today");
    if (daysSinceLast === 1) return tr("Laatste check-in: gisteren", "Last check-in: yesterday");
    return tr(`Laatste check-in: ${daysSinceLast} dagen geleden`, `Last check-in: ${daysSinceLast} days ago`);
  })();

  const isDue = daysSinceLast === null || daysSinceLast >= 7;
  const recentAverage = lastCheckIn ? averageScore(lastCheckIn) : null;

  return (
    <div className="space-y-4 px-1 py-2">
      <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-slate-900/65 to-slate-900/35 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-xl font-semibold text-slate-100">{tr("Welzijns check-in", "Wellbeing check-in")}</p>
            <p className={`text-sm ${isDue ? "text-amber-300" : "text-slate-300"}`}>
              {isDue
                ? tr("Tijd voor een nieuwe check-in", "Time for a new check-in")
                : tr("Op schema", "On track")}
            </p>
            <p className="text-xs text-slate-500">{statusLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              {tr("Laatste gemiddelde", "Latest average")}:{" "}
              <span className="font-semibold text-slate-100">{recentAverage === null ? "—" : recentAverage.toFixed(1)}</span>
            </div>
            {!isShareMode && !showForm ? (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-lg border border-cyan-500/45 bg-cyan-500/12 px-4 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/20"
              >
                {tr("Inchecken", "Check in")}
              </button>
            ) : null}
          </div>
        </div>

        {showForm ? (
          <div className="mt-4 border-t border-slate-700/60 pt-4">
            <CheckInForm
              onSave={handleAdd}
              onCancel={() => setShowForm(false)}
              language={language}
            />
          </div>
        ) : null}
      </section>

      {sorted.length >= 2 ? <TrendChart checkIns={[...sorted].reverse()} language={language} /> : null}

      {sorted.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {tr("Geschiedenis", "History")}
            </p>
            {sorted.length > 6 ? (
              <button
                type="button"
                onClick={() => setShowAllHistory((current) => !current)}
                className="rounded-md border border-slate-700 bg-slate-900/55 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
              >
                {showAllHistory ? tr("Toon minder", "Show less") : tr("Toon alles", "Show all")}
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {displayedHistory.map((c) => (
              <div key={c.id} className={editingId === c.id ? "lg:col-span-2" : ""}>
                <CheckInCard
                  checkIn={c}
                  language={language}
                  isEditing={editingId === c.id}
                  onEdit={() => setEditingId(c.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(data) => handleUpdate(c.id, data)}
                  onDelete={() => onDelete(c.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sorted.length === 0 && !showForm ? (
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/30 px-6 py-10 text-center">
          <p className="text-3xl">🧘</p>
          <p className="mt-2 text-sm font-medium text-slate-300">
            {tr("Nog geen check-ins", "No check-ins yet")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {tr(
              "Start met één korte check-in per week om trends naast je labwaarden te zien.",
              "Start with one short weekly check-in to view trends next to your lab results."
            )}
          </p>
        </section>
      ) : null}
    </div>
  );
};

export default CheckInsView;
