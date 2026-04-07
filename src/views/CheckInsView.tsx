import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { differenceInDays, format, parseISO } from "date-fns";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import EmptyStateCard from "../components/EmptyStateCard";
import { trLocale } from "../i18n";
import { AppLanguage, SymptomCheckIn, UserProfile, WellbeingMetricId } from "../types";
import { getCheckInAverage, getCheckInMetricValue, WELLBEING_METRICS, WELLBEING_PRESETS } from "../wellbeingMetrics";

const SCORE_EMOJIS: Record<number, string> = {
  1: "😫",
  2: "😩",
  3: "😟",
  4: "😕",
  5: "😐",
  6: "🙂",
  7: "😊",
  8: "😄",
  9: "😁",
  10: "🤩"
};

const scoreToEmoji = (score: number | null): string => {
  if (score === null) return "—";
  return SCORE_EMOJIS[Math.round(score)] ?? "😐";
};

const toLegacyFields = (values: Partial<Record<WellbeingMetricId, number>>) => ({
  energy: values.energy ?? null,
  mood: values.mood ?? null,
  sleep: values.sleep ?? null,
  libido: values.libido ?? null,
  motivation: values.motivation ?? null
});

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
          onChange={(event) => onChange(Number(event.target.value))}
          className="checkin-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 outline-none"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${((current - 1) / 9) * 100}%, #334155 ${((current - 1) / 9) * 100}%, #334155 100%)`
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

interface CheckInFormProps {
  userProfile: UserProfile;
  initial?: SymptomCheckIn;
  onSave: (data: Omit<SymptomCheckIn, "id">) => void;
  onCancel: () => void;
  language: AppLanguage;
}

const CheckInForm = ({ userProfile, initial, onSave, onCancel, language }: CheckInFormProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const today = new Date().toISOString().slice(0, 10);
  const metrics = WELLBEING_PRESETS[userProfile];
  const [date, setDate] = useState(initial?.date ?? today);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [values, setValues] = useState<Partial<Record<WellbeingMetricId, number>>>(() =>
    metrics.reduce(
      (acc, metricId) => {
        acc[metricId] = getCheckInMetricValue(initial ?? ({} as SymptomCheckIn), metricId) ?? 5;
        return acc;
      },
      {} as Partial<Record<WellbeingMetricId, number>>
    )
  );

  const handleSave = () => {
    const payload = {
      date,
      profileAtEntry: userProfile,
      values,
      ...toLegacyFields(values),
      notes
    };
    onSave(payload);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Datum", "Date")}</label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-4 sm:gap-5">
        {metrics.map((metricId) => {
          const metric = WELLBEING_METRICS[metricId];
          return (
            <EmojiSlider
              key={metricId}
              value={values[metricId] ?? null}
              onChange={(value) => setValues((current) => ({ ...current, [metricId]: value }))}
              label={trLocale(language, metric.labelNl, metric.labelEn)}
              icon={metric.icon}
              color={metric.color}
            />
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          {tr("Notities (optioneel)", "Notes (optional)")}
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder={tr("Hoe voelde je je vandaag?", "How were you feeling today?")}
          className="w-full resize-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/14 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/24"
        >
          {tr("Opslaan", "Save check-in")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          {tr("Annuleren", "Cancel")}
        </button>
      </div>
    </div>
  );
};

interface CheckInCardProps {
  checkIn: SymptomCheckIn;
  language: AppLanguage;
  onEdit: () => void;
  onDelete: () => void;
}

const CheckInCard = ({ checkIn, language, onEdit, onDelete }: CheckInCardProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avg = getCheckInAverage(checkIn);
  const metrics = WELLBEING_PRESETS[checkIn.profileAtEntry ?? "trt"];

  return (
    <div className="checkins-history-card h-full rounded-xl border border-slate-700/60 bg-gradient-to-br from-slate-900/55 to-slate-900/35 p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-100">{format(parseISO(checkIn.date), "d MMM yyyy")}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {avg === null ? tr("Geen complete score", "No complete score") : tr("Gemiddelde", "Average")} {avg === null ? "—" : avg.toFixed(1)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-slate-300">
          {avg === null ? "—" : `${scoreToEmoji(Math.round(avg))} ${Math.round(avg)}/10`}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {metrics.map((metricId) => {
          const metric = WELLBEING_METRICS[metricId];
          const value = getCheckInMetricValue(checkIn, metricId);
          return (
            <span key={metricId} className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-300">
              <span className="text-[13px] leading-none">{metric.icon}</span>
              <span className="text-slate-400">{trLocale(language, metric.labelNl, metric.labelEn)}</span>
              <span className="font-semibold text-slate-100">{value ?? "—"}</span>
            </span>
          );
        })}
      </div>

      {checkIn.notes ? <p className="mt-2.5 border-t border-slate-700/60 pt-2.5 text-sm text-slate-300 italic">{checkIn.notes}</p> : null}

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

interface CheckInModalProps {
  open: boolean;
  title: string;
  userProfile: UserProfile;
  initial?: SymptomCheckIn;
  language: AppLanguage;
  onSave: (data: Omit<SymptomCheckIn, "id">) => void;
  onClose: () => void;
}

const CheckInModal = ({ open, title, userProfile, initial, language, onSave, onClose }: CheckInModalProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="app-modal-overlay z-[92]" role="dialog" aria-modal="true" aria-labelledby="wellbeing-checkin-modal-title" onClick={onClose}>
      <div
        className="app-modal-shell flex max-h-[92vh] w-full max-w-3xl flex-col bg-slate-900 shadow-soft sm:max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-modal-header p-5 sm:p-6">
          <div className="app-modal-header-glow" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                {tr("Welzijn", "Wellbeing")}
              </div>
              <h3 id="wellbeing-checkin-modal-title" className="mt-3 text-xl font-semibold text-slate-50 sm:text-2xl">
                {title}
              </h3>
            </div>
            <button
              type="button"
              className="app-modal-close-btn"
              onClick={onClose}
              aria-label={tr("Sluiten", "Close")}
              title={tr("Sluiten", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <CheckInForm userProfile={userProfile} initial={initial} onSave={onSave} onCancel={onClose} language={language} />
        </div>
      </div>
    </div>,
    document.body
  );
};

interface TrendChartProps {
  checkIns: SymptomCheckIn[];
  language: AppLanguage;
}

const TrendChart = ({ checkIns, language }: TrendChartProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const activeMetrics = Array.from(
    new Set(checkIns.flatMap((checkIn) => Object.keys(checkIn.values ?? {})))
  ) as WellbeingMetricId[];
  const data = checkIns.map((checkIn) => {
    const row: Record<string, string | number | null> = {
      date: format(parseISO(checkIn.date), "d MMM")
    };
    activeMetrics.forEach((metricId) => {
      row[metricId] = getCheckInMetricValue(checkIn, metricId);
    });
    return row;
  });

  if (data.length < 2 || activeMetrics.length === 0) return null;

  return (
    <div className="checkins-trend-card app-teal-glow-surface rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Trend over tijd", "Trend over time")}</p>
        <p className="mt-1 text-xs text-slate-500">
          {tr("Snel overzicht van hoe je welzijn zich ontwikkelt per check-in.", "Quick view of how your wellbeing changes across check-ins.")}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }} className="checkins-trend-chart">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" />
          <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fontSize: 11, fill: "#64748b" }} width={26} />
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip-bg)",
              border: "1px solid var(--chart-tooltip-border)",
              borderRadius: 10,
              fontSize: 12
            }}
            labelStyle={{ color: "var(--chart-tooltip-label)" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
          {activeMetrics.map((metricId) => {
            const metric = WELLBEING_METRICS[metricId];
            return (
              <Line
                key={metricId}
                type="monotone"
                dataKey={metricId}
                name={trLocale(language, metric.labelNl, metric.labelEn)}
                stroke={metric.color}
                strokeWidth={2.5}
                dot={{ r: 3, fill: metric.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

interface CheckInsViewProps {
  checkIns: SymptomCheckIn[];
  userProfile: UserProfile;
  language: AppLanguage;
  isShareMode: boolean;
  onAdd: (data: Omit<SymptomCheckIn, "id">) => void;
  onUpdate: (id: string, data: Partial<SymptomCheckIn>) => void;
  onDelete: (id: string) => void;
}

const CheckInsView = ({ checkIns, userProfile, language, isShareMode, onAdd, onUpdate, onDelete }: CheckInsViewProps) => {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const sorted = useMemo(() => [...checkIns].sort((left, right) => right.date.localeCompare(left.date)), [checkIns]);
  const displayedHistory = showAllHistory ? sorted : sorted.slice(0, 6);
  const editingCheckIn = useMemo(
    () => (editingId ? sorted.find((checkIn) => checkIn.id === editingId) ?? null : null),
    [editingId, sorted]
  );
  const lastCheckIn = sorted[0] ?? null;
  const daysSinceLast = lastCheckIn ? differenceInDays(new Date(), parseISO(lastCheckIn.date)) : null;

  const handleAdd = (data: Omit<SymptomCheckIn, "id">) => {
    onAdd(data);
    setIsCreateModalOpen(false);
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
  const recentAverage = lastCheckIn ? getCheckInAverage(lastCheckIn) : null;

  return (
    <div className="space-y-4 px-1 py-2">
      <section className="checkins-hero app-teal-glow-surface rounded-xl border border-slate-700/70 bg-gradient-to-br from-slate-900/65 to-slate-900/35 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-xl font-semibold text-slate-100">{tr("Welzijns check-in", "Wellbeing check-in")}</p>
            <p className={`text-sm ${isDue ? "text-amber-300" : "text-slate-300"}`}>
              {isDue ? tr("Tijd voor een nieuwe check-in", "Time for a new check-in") : tr("Op schema", "On track")}
            </p>
            <p className="text-xs text-slate-500">{statusLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              {tr("Laatste gemiddelde", "Latest average")}: <span className="font-semibold text-slate-100">{recentAverage === null ? "—" : recentAverage.toFixed(1)}</span>
            </div>
            {!isShareMode ? (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="checkin-primary-btn rounded-lg border border-cyan-500/45 bg-cyan-500/12 px-4 py-2 text-sm font-semibold text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/20"
              >
                {tr("Inchecken", "Check in")}
              </button>
            ) : null}
          </div>
        </div>

      </section>

      {sorted.length >= 2 ? <TrendChart checkIns={[...sorted].reverse()} language={language} /> : null}

      {sorted.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Geschiedenis", "History")}</p>
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
            {displayedHistory.map((checkIn) => (
              <div key={checkIn.id}>
                <CheckInCard
                  checkIn={checkIn}
                  language={language}
                  onEdit={() => setEditingId(checkIn.id)}
                  onDelete={() => onDelete(checkIn.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sorted.length === 0 && !isCreateModalOpen ? (
        <EmptyStateCard
          title={tr("Nog geen check-ins", "No check-ins yet")}
          description={tr(
            "Start met één korte check-in per week om trends naast je labwaarden te zien.",
            "Start with one short weekly check-in to view trends next to your lab results."
          )}
          actionLabel={!isShareMode ? tr("Check-in starten", "Start check-in") : undefined}
          onAction={!isShareMode ? () => setIsCreateModalOpen(true) : undefined}
          icon={<span className="text-3xl" aria-hidden>🧘</span>}
        />
      ) : null}

      <CheckInModal
        open={isCreateModalOpen}
        title={tr("Welzijns check-in", "Wellbeing check-in")}
        userProfile={userProfile}
        language={language}
        onSave={handleAdd}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <CheckInModal
        open={Boolean(editingCheckIn)}
        title={tr("Check-in bewerken", "Edit check-in")}
        userProfile={editingCheckIn?.profileAtEntry ?? userProfile}
        initial={editingCheckIn ?? undefined}
        language={language}
        onSave={(data) => {
          if (editingCheckIn) {
            handleUpdate(editingCheckIn.id, data);
          }
        }}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
};

export default CheckInsView;
