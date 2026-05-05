import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import Dexie, { Table } from "dexie";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  DatabaseBackup,
  History,
  Image as ImageIcon,
  NotebookPen,
  Play,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TabKey = "train" | "routines" | "calendar" | "history" | "backup";
type SortMode = "order" | "status";

type MachineConfig = {
  id: string;
  key: string;
  value: string;
};

type Exercise = {
  id: string;
  name: string;
  order: number | null;
  weight: number | null;
  reps: number | null;
  time: string | null;
  sets: number | null;
  completedSets: number;
  notes: string;
  configs: MachineConfig[];
  images: string[];
  done: boolean;
  doneAt: string | null;
  createdAt: string;
};

type Routine = {
  id: string;
  name: string;
  notes: string;
  exercises: Exercise[];
  createdAt: string;
  updatedAt: string;
};

type Session = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  bodyweight: number | null;
  routineId: string | null;
  routineName: string | null;
  exercises: Exercise[];
};

type UIState = {
  activeTab: TabKey;
  sortMode: SortMode;
  calendarYear: number;
  calendarMonth: number;
  isExerciseFormOpen: boolean;
};

type AppState = {
  routines: Routine[];
  currentSession: Session;
  historySessions: Session[];
  completedDates: string[];
  ui: UIState;
};

type ExerciseDraft = {
  name: string;
  order: string;
  weight: string;
  reps: string;
  time: string;
  sets: string;
  notes: string;
};

type RoutineDraft = {
  name: string;
  notes: string;
};

type ExerciseTemplate = {
  name: string;
  notes: string;
  configs: MachineConfig[];
  images: string[];
  weight: number | null;
  reps: number | null;
  time: string | null;
  createdAt: string | null;
};

class GymTrackerDB extends Dexie {
  state!: Table<{ id: string; value: AppState; updatedAt: string }, string>;

  constructor() {
    super("gym-tracker-react-pwa-db");
    this.version(1).stores({
      state: "id",
    });
  }
}

const db = new GymTrackerDB();
const STATE_ID = "main";

function UpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-emerald-200">Nueva versión disponible</div>
          <div className="text-sm text-slate-300">
            La app descargó una actualización. Para aplicar los cambios, recárgala ahora.
          </div>
        </div>
        <button
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
          onClick={onReload}
        >
          Actualizar app
        </button>
      </div>
    </div>
  );
}

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const nowIso = () => new Date().toISOString();

const emptyExerciseDraft = (): ExerciseDraft => ({
  name: "",
  order: "",
  weight: "",
  reps: "",
  time: "",
  sets: "",
  notes: "",
});

const emptyRoutineDraft = (): RoutineDraft => ({
  name: "",
  notes: "",
});

const toNumberOrNull = (value: string) => {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatTime = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const shortDateKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
};

const isoToDatetimeLocal = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const datetimeLocalToIso = (value: string) => {
  if (!value) return null;
  return new Date(value).toISOString();
};

const localDateFromDatetimeLocal = (value: string) => (value ? value.slice(0, 10) : null);

const getDefaultState = (): AppState => ({
  routines: [],
  currentSession: {
    id: uid(),
    date: todayKey(),
    startTime: null,
    endTime: null,
    bodyweight: null,
    routineId: null,
    routineName: null,
    exercises: [],
  },
  historySessions: [],
  completedDates: [],
  ui: {
    activeTab: "train",
    sortMode: "order",
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    isExerciseFormOpen: false,
  },
});

const normalizeState = (raw?: Partial<AppState> | null): AppState => {
  const base = getDefaultState();
  return {
    ...base,
    ...(raw || {}),
    routines: Array.isArray(raw?.routines) ? raw!.routines : [],
    currentSession: {
      ...base.currentSession,
      ...(raw?.currentSession || {}),
      exercises: Array.isArray(raw?.currentSession?.exercises)
        ? raw!.currentSession!.exercises
        : [],
    },
    historySessions: Array.isArray(raw?.historySessions) ? raw!.historySessions : [],
    completedDates: Array.isArray(raw?.completedDates) ? raw!.completedDates : [],
    ui: {
      ...base.ui,
      ...(raw?.ui || {}),
    },
  };
};

const normalizeConfig = (config: unknown): MachineConfig | null => {
  if (!config || typeof config !== "object") return null;
  const raw = config as Record<string, unknown>;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!key || !value) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    key,
    value,
  };
};

const normalizeExercise = (exercise: unknown, fallbackOrder?: number): Exercise | null => {
  if (!exercise || typeof exercise !== "object") return null;
  const raw = exercise as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const configs = Array.isArray(raw.configs)
    ? raw.configs.map((item) => normalizeConfig(item)).filter((item): item is MachineConfig => !!item)
    : [];

  const images = Array.isArray(raw.images)
    ? raw.images.filter((item): item is string => typeof item === "string" && !!item)
    : [];

  const numberField = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const sets = numberField(raw.sets);
  const completedSetsRaw = numberField(raw.completedSets) ?? 0;
  const completedSets = sets ? Math.max(0, Math.min(completedSetsRaw, sets)) : 0;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name,
    order: numberField(raw.order) ?? fallbackOrder ?? null,
    weight: numberField(raw.weight),
    reps: numberField(raw.reps),
    time: typeof raw.time === "string" && raw.time.trim() ? raw.time.trim() : null,
    sets,
    completedSets,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    configs,
    images,
    done: Boolean(raw.done),
    doneAt: typeof raw.doneAt === "string" ? raw.doneAt : null,
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : nowIso(),
  };
};

const normalizeSession = (session: unknown, fallbackDate = todayKey()): Session => {
  const baseSession: Session = {
    id: uid(),
    date: fallbackDate,
    startTime: null,
    endTime: null,
    bodyweight: null,
    routineId: null,
    routineName: null,
    exercises: [],
  };

  if (!session || typeof session !== "object") return baseSession;
  const raw = session as Record<string, unknown>;
  const numberField = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map((item, index) => normalizeExercise(item, index + 1))
        .filter((item): item is Exercise => !!item)
    : [];

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    date: typeof raw.date === "string" && raw.date ? raw.date : fallbackDate,
    startTime: typeof raw.startTime === "string" ? raw.startTime : null,
    endTime: typeof raw.endTime === "string" ? raw.endTime : null,
    bodyweight: numberField(raw.bodyweight),
    routineId: typeof raw.routineId === "string" ? raw.routineId : null,
    routineName: typeof raw.routineName === "string" ? raw.routineName : null,
    exercises,
  };
};

const normalizeRoutine = (routine: unknown): Routine | null => {
  if (!routine || typeof routine !== "object") return null;
  const raw = routine as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map((item, index) => normalizeExercise(item, index + 1))
        .filter((item): item is Exercise => !!item)
    : [];

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    exercises,
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : nowIso(),
  };
};

const migrateImportedBackup = (raw: unknown): AppState => {
  if (!raw || typeof raw !== "object") return getDefaultState();
  const source = raw as Record<string, unknown>;

  const routines = Array.isArray(source.routines)
    ? source.routines.map((item) => normalizeRoutine(item)).filter((item): item is Routine => !!item)
    : [];

  const currentSession = normalizeSession(source.currentSession, todayKey());

  const historySessions = Array.isArray(source.historySessions)
    ? source.historySessions
        .map((item) => normalizeSession(item, todayKey()))
        .filter((item) => item.exercises.length || item.startTime || item.endTime || item.bodyweight !== null)
    : [];

  const completedDatesFromSessions = historySessions
    .filter((session) => session.exercises.length)
    .map((session) => session.date);

  const completedDates = Array.from(
    new Set([
      ...(Array.isArray(source.completedDates)
        ? source.completedDates.filter((item): item is string => typeof item === "string")
        : []),
      ...completedDatesFromSessions,
      ...(currentSession.exercises.length && currentSession.endTime ? [currentSession.date] : []),
    ])
  );

  const rawUi = source.ui && typeof source.ui === "object" ? (source.ui as Record<string, unknown>) : {};
  const ui: UIState = {
    activeTab:
      rawUi.activeTab === "train" ||
      rawUi.activeTab === "routines" ||
      rawUi.activeTab === "calendar" ||
      rawUi.activeTab === "history" ||
      rawUi.activeTab === "backup"
        ? rawUi.activeTab
        : "train",
    sortMode: rawUi.sortMode === "status" ? "status" : "order",
    calendarYear:
      typeof rawUi.calendarYear === "number" && Number.isFinite(rawUi.calendarYear)
        ? rawUi.calendarYear
        : new Date().getFullYear(),
    calendarMonth:
      typeof rawUi.calendarMonth === "number" && rawUi.calendarMonth >= 0 && rawUi.calendarMonth <= 11
        ? rawUi.calendarMonth
        : new Date().getMonth(),
    isExerciseFormOpen: Boolean(rawUi.isExerciseFormOpen),
  };

  return normalizeState({
    routines,
    currentSession,
    historySessions,
    completedDates,
    ui,
  });
};

const cloneExerciseForSession = (exercise: Exercise, forcedOrder?: number): Exercise => ({
  ...JSON.parse(JSON.stringify(exercise)),
  id: uid(),
  order: forcedOrder ?? exercise.order ?? 1,
  done: false,
  doneAt: null,
  completedSets: 0,
  createdAt: nowIso(),
});

const normalizeExerciseOrders = (exercises: Exercise[]) =>
  [...exercises]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.createdAt.localeCompare(b.createdAt))
    .map((exercise, index) => ({
      ...exercise,
      order: index + 1,
    }));

const cloneExercisesForSession = (exercises: Exercise[], startOrder?: number) => {
  const ordered = [...exercises].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const cloned = ordered.map((exercise, index) =>
    cloneExerciseForSession(
      exercise,
      startOrder == null ? exercise.order ?? index + 1 : startOrder + index
    )
  );
  return normalizeExerciseOrders(cloned);
};

const templateExercisesFromSession = (exercises: Exercise[]) =>
  normalizeExerciseOrders(
    [...exercises]
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((exercise, index) => ({
        ...JSON.parse(JSON.stringify(exercise)),
        id: uid(),
        order: exercise.order ?? index + 1,
        done: false,
        doneAt: null,
        completedSets: 0,
        createdAt: nowIso(),
      }))
  );

const hasSessionContent = (session: Session) =>
  !!(
    session.startTime ||
    session.endTime ||
    session.bodyweight !== null ||
    session.exercises.length
  );

const compressImage = async (file: File, maxSize = 1400, quality = 0.82): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  let { width, height } = img;
  if (width > height && width > maxSize) {
    height = Math.round((height * maxSize) / width);
    width = maxSize;
  } else if (height >= width && height > maxSize) {
    width = Math.round((width * maxSize) / height);
    height = maxSize;
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

const getTemplateScore = (exercise: ExerciseTemplate) => {
  let score = 0;
  if (exercise.configs.length) score += 10;
  if (exercise.images.length) score += 10;
  if (exercise.notes) score += 2;
  if (exercise.time) score += 1;
  if (exercise.reps !== null) score += 1;
  if (exercise.weight !== null) score += 1;
  return score;
};

const buildExerciseLibrary = (candidates: Exercise[]): ExerciseTemplate[] => {
  const map = new Map<string, ExerciseTemplate & { _score: number }>();

  for (const exercise of candidates) {
    const key = exercise.name.trim().toLowerCase();
    if (!key) continue;

    const candidate: ExerciseTemplate & { _score: number } = {
      name: exercise.name.trim(),
      notes: exercise.notes || "",
      configs: Array.isArray(exercise.configs)
        ? exercise.configs.map((cfg) => ({ key: cfg.key, value: cfg.value, id: uid() }))
        : [],
      images: Array.isArray(exercise.images) ? [...exercise.images] : [],
      weight: exercise.weight ?? null,
      reps: exercise.reps ?? null,
      time: exercise.time ?? null,
      createdAt: exercise.createdAt || null,
      _score: 0,
    };
    candidate._score = getTemplateScore(candidate);

    const existing = map.get(key);
    const candidateTime = new Date(candidate.createdAt || 0).getTime();
    const existingTime = existing ? new Date(existing.createdAt || 0).getTime() : -Infinity;

    if (!existing || candidate._score > existing._score || (candidate._score === existing._score && candidateTime > existingTime)) {
      map.set(key, candidate);
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" })
  );
};

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-2xl border px-3 py-3 text-sm font-semibold shadow-lg transition",
        active
          ? "border-sky-400/50 bg-gradient-to-r from-emerald-500/20 to-sky-500/20 text-white"
          : "border-slate-700 bg-slate-900/90 text-slate-200"
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
    </button>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-700 bg-slate-900/90 p-4 shadow-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
      <div className="mb-2 text-sm text-slate-400">{label}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  mode,
  onToggleDone,
  onCompleteSet,
  onUndoSet,
  onDelete,
  onMoveUp,
  onMoveDown,
  onCopy,
  onOpenImage,
  onRemovePhoto,
}: {
  exercise: Exercise;
  mode: "current" | "history" | "routine";
  onToggleDone?: () => void;
  onCompleteSet?: () => void;
  onUndoSet?: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onCopy?: () => void;
  onOpenImage?: (src: string) => void;
  onRemovePhoto?: (index: number) => void;
}) {
  const metrics = [
    ["Peso", exercise.weight !== null ? `${exercise.weight} kg` : "—"],
    ["Repeticiones", exercise.reps ?? "—"],
    ["Tiempo", exercise.time || "—"],
    ["Series", exercise.sets ? `${exercise.completedSets}/${exercise.sets}` : "—"],
    [
      mode === "current" ? "Realizado" : mode === "routine" ? "Orden base" : "Último registro",
      mode === "current"
        ? exercise.doneAt
          ? formatTime(exercise.doneAt)
          : "Pendiente"
        : mode === "routine"
        ? exercise.order ?? "—"
        : exercise.doneAt
        ? formatTime(exercise.doneAt)
        : "Pendiente",
    ],
  ] as const;

  return (
    <div
      className={cx(
        "rounded-3xl border bg-gradient-to-b from-slate-800/95 to-slate-900/95 p-4",
        exercise.done ? "border-emerald-500/40" : "border-slate-700"
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              #{exercise.order ?? "-"}
            </span>
            <span className="text-lg font-semibold text-white">{exercise.name}</span>
            {exercise.done && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                Hecho
              </span>
            )}
            {mode !== "current" && (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                {mode === "routine" ? "Rutina" : "Histórico"}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-slate-400">Creado {formatDateTime(exercise.createdAt)}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {mode === "current" ? (
            <>
              {exercise.sets ? (
                <>
                  <button
                    className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    onClick={onCompleteSet}
                    disabled={exercise.completedSets >= exercise.sets}
                  >
                    Completar 1 serie
                  </button>
                  <button
                    className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
                    onClick={onUndoSet}
                    disabled={exercise.completedSets <= 0}
                  >
                    Restar 1 serie
                  </button>
                </>
              ) : null}
              <button className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white" onClick={onToggleDone}>
                {exercise.done ? "Desmarcar" : "Completar"}
              </button>
              <button className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white" onClick={onMoveUp}>
                Subir
              </button>
              <button className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white" onClick={onMoveDown}>
                Bajar
              </button>
              <button className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white" onClick={onDelete}>
                Eliminar
              </button>
            </>
          ) : (
            <button className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white" onClick={onCopy}>
              Copiar a sesión actual
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-sm font-semibold text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-400">Configuración de máquina (opcional)</div>
        {exercise.configs.length ? (
          <div className="grid gap-3 md:grid-cols-4">
            {exercise.configs.map((cfg) => (
              <div key={cfg.id} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                <div className="mb-1 text-xs text-slate-400">{cfg.key}</div>
                <div className="text-sm font-semibold text-slate-100">{cfg.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">Sin configuración de máquina / no aplica.</div>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-400">Notas</div>
        <div className="text-sm text-slate-200">
          {exercise.notes || <span className="text-slate-500">Sin notas.</span>}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-400">Imágenes</div>
        {exercise.images.length ? (
          <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
            {exercise.images.map((image, index) => (
              <div key={`${exercise.id}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                <img
                  src={image}
                  alt={`${exercise.name}-${index + 1}`}
                  className="aspect-square w-full cursor-zoom-in object-cover"
                  onClick={() => onOpenImage?.(image)}
                />
                {mode === "current" && (
                  <button
                    className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white"
                    onClick={() => onRemovePhoto?.(index)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">Sin imágenes referenciales.</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return;
      registration.update();
      setInterval(() => registration.update(), 60 * 1000);
    },
    onRegisterError(error: unknown) {
      console.error("SW registration error", error);
    },
  });
  const [appState, setAppState] = useState<AppState>(getDefaultState());
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft>(emptyExerciseDraft());
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft>(emptyRoutineDraft());
  const [configDraft, setConfigDraft] = useState({ key: "", value: "" });
  const [pendingConfigs, setPendingConfigs] = useState<MachineConfig[]>([]);
  const [pendingTemplateImages, setPendingTemplateImages] = useState<string[]>([]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const fileImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await db.state.get(STATE_ID);
        setAppState(normalizeState(stored?.value));
      } finally {
        setReady(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!ready) return;
    db.state.put({ id: STATE_ID, value: appState, updatedAt: nowIso() });
  }, [appState, ready]);

  const updateUi = (patch: Partial<UIState>) => {
    setAppState((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
  };

  const updateCurrentSession = (patch: Partial<Session>) => {
    setAppState((prev) => ({
      ...prev,
      currentSession: { ...prev.currentSession, ...patch },
    }));
  };

  const allExerciseCandidates = useMemo(() => {
    const list: Exercise[] = [];
    appState.currentSession.exercises.forEach((exercise) => list.push(exercise));
    appState.historySessions.forEach((session) => session.exercises.forEach((exercise) => list.push(exercise)));
    appState.routines.forEach((routine) => routine.exercises.forEach((exercise) => list.push(exercise)));
    return list;
  }, [appState]);

  const exerciseLibrary = useMemo(
    () => buildExerciseLibrary(allExerciseCandidates),
    [allExerciseCandidates]
  );

  const exerciseSuggestions = useMemo(() => {
    const query = exerciseDraft.name.trim().toLowerCase();
    if (!query) return [];
    return exerciseLibrary
      .filter((item) => item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      })
      .slice(0, 8);
  }, [exerciseDraft.name, exerciseLibrary]);

  const nextOrder = useMemo(() => appState.currentSession.exercises.length + 1, [appState.currentSession.exercises]);

  const sortedExercises = useMemo(() => {
    const items = [...appState.currentSession.exercises];
    if (appState.ui.sortMode === "status") {
      items.sort((a, b) => Number(a.done) - Number(b.done) || (a.order ?? 999) - (b.order ?? 999));
    } else {
      items.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.createdAt.localeCompare(b.createdAt));
    }
    return items;
  }, [appState.currentSession.exercises, appState.ui.sortMode]);

  const doneCount = appState.currentSession.exercises.filter((item) => item.done).length;

  const weightSeries = useMemo(
    () =>
      [...appState.historySessions]
        .filter((session) => session.bodyweight !== null && session.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((session) => ({ fecha: shortDateKey(session.date), peso: Number(session.bodyweight) }))
        .filter((point) => Number.isFinite(point.peso)),
    [appState.historySessions]
  );

  const calendarMonthLabel = useMemo(() => {
    const label = new Date(appState.ui.calendarYear, appState.ui.calendarMonth, 1).toLocaleDateString(
      "es-CL",
      { month: "long", year: "numeric" }
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [appState.ui.calendarYear, appState.ui.calendarMonth]);

  const selectedCalendarSessions = useMemo(
    () =>
      selectedCalendarDate
        ? appState.historySessions
            .filter((session) => session.date === selectedCalendarDate)
            .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")))
        : [],
    [appState.historySessions, selectedCalendarDate]
  );

  const resetExerciseDraft = () => {
    setExerciseDraft(emptyExerciseDraft());
    setPendingConfigs([]);
    setPendingTemplateImages([]);
    setUploadFiles([]);
    setConfigDraft({ key: "", value: "" });
  };

  const applyExerciseTemplate = (template: ExerciseTemplate) => {
    setExerciseDraft((prev) => ({
      ...prev,
      name: template.name,
      notes: prev.notes || template.notes || "",
    }));
    setPendingConfigs(template.configs.map((cfg) => ({ ...cfg, id: uid() })));
    setPendingTemplateImages([...template.images]);
  };

  const addConfig = () => {
    if (!configDraft.key.trim() || !configDraft.value.trim()) return;
    setPendingConfigs((prev) => [
      ...prev,
      { id: uid(), key: configDraft.key.trim(), value: configDraft.value.trim() },
    ]);
    setConfigDraft({ key: "", value: "" });
  };

  const saveExercise = async () => {
    if (!exerciseDraft.name.trim()) {
      alert("Ingresa el nombre del ejercicio.");
      return;
    }

    const uploadedImages = await Promise.all(uploadFiles.map((file) => compressImage(file)));

    const exercise: Exercise = {
      id: uid(),
      name: exerciseDraft.name.trim(),
      order: toNumberOrNull(exerciseDraft.order) ?? nextOrder,
      weight: toNumberOrNull(exerciseDraft.weight),
      reps: toNumberOrNull(exerciseDraft.reps),
      time: exerciseDraft.time.trim() || null,
      sets: toNumberOrNull(exerciseDraft.sets),
      completedSets: 0,
      notes: exerciseDraft.notes.trim(),
      configs: JSON.parse(JSON.stringify(pendingConfigs)),
      images: [...pendingTemplateImages, ...uploadedImages],
      done: false,
      doneAt: null,
      createdAt: nowIso(),
    };

    updateCurrentSession({
      exercises: normalizeExerciseOrders([...appState.currentSession.exercises, exercise]),
    });
    resetExerciseDraft();
  };

  const addCompletedDate = (dateKey: string) => {
    setAppState((prev) => ({
      ...prev,
      completedDates: prev.completedDates.includes(dateKey)
        ? prev.completedDates
        : [...prev.completedDates, dateKey],
    }));
  };

  const archiveSession = () => {
    if (!hasSessionContent(appState.currentSession)) {
      alert("No hay datos en la sesión actual para guardar en historial.");
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(appState.currentSession)) as Session;
    setAppState((prev) => ({
      ...prev,
      historySessions: [snapshot, ...prev.historySessions],
      completedDates:
        snapshot.exercises.length && !prev.completedDates.includes(snapshot.date)
          ? [snapshot.date, ...prev.completedDates]
          : prev.completedDates,
      currentSession: {
        id: uid(),
        date: todayKey(),
        startTime: null,
        endTime: null,
        bodyweight: null,
        routineId: null,
        routineName: null,
        exercises: [],
      },
    }));
    resetExerciseDraft();
  };

  const createNewSession = () => {
    if (hasSessionContent(appState.currentSession)) {
      const shouldArchive = window.confirm(
        "La sesión actual tiene datos. ¿Quieres guardarla en el historial antes de crear una nueva?"
      );
      if (shouldArchive) {
        archiveSession();
        return;
      }
    }

    setAppState((prev) => ({
      ...prev,
      currentSession: {
        id: uid(),
        date: todayKey(),
        startTime: null,
        endTime: null,
        bodyweight: null,
        routineId: null,
        routineName: null,
        exercises: [],
      },
    }));
    resetExerciseDraft();
  };

  const saveRoutine = () => {
    if (!routineDraft.name.trim()) {
      alert("Ingresa un nombre para la rutina.");
      return;
    }
    if (!appState.currentSession.exercises.length) {
      alert("Agrega al menos un ejercicio antes de guardar una rutina.");
      return;
    }

    setAppState((prev) => {
      const routines = [...prev.routines];
      const existingIndex = routines.findIndex(
        (routine) => routine.name.toLowerCase() === routineDraft.name.trim().toLowerCase()
      );

      const nextRoutine: Routine = {
        id: existingIndex >= 0 ? routines[existingIndex].id : uid(),
        name: routineDraft.name.trim(),
        notes: routineDraft.notes.trim(),
        exercises: templateExercisesFromSession(prev.currentSession.exercises),
        createdAt: existingIndex >= 0 ? routines[existingIndex].createdAt : nowIso(),
        updatedAt: nowIso(),
      };

      if (existingIndex >= 0) {
        routines[existingIndex] = nextRoutine;
      } else {
        routines.unshift(nextRoutine);
      }

      return {
        ...prev,
        routines,
        ui: { ...prev.ui, activeTab: "routines" },
      };
    });

    setRoutineDraft(emptyRoutineDraft());
  };

  const applyRoutine = (routineId: string) => {
    const routine = appState.routines.find((item) => item.id === routineId);
    if (!routine) return;

    let replaceMode = true;
    if (appState.currentSession.exercises.length > 0) {
      replaceMode = window.confirm(
        "¿Quieres reemplazar la sesión actual con esta rutina? Aceptar = reemplazar. Cancelar = agregar al final."
      );
    }

    setAppState((prev) => ({
      ...prev,
      currentSession: {
        ...prev.currentSession,
        exercises: replaceMode
          ? cloneExercisesForSession(routine.exercises)
          : normalizeExerciseOrders([
              ...prev.currentSession.exercises,
              ...cloneExercisesForSession(routine.exercises, nextOrder),
            ]),
        startTime: replaceMode ? null : prev.currentSession.startTime,
        endTime: replaceMode ? null : prev.currentSession.endTime,
        routineId: routine.id,
        routineName: routine.name,
      },
      ui: { ...prev.ui, activeTab: "train" },
    }));
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-tracker-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      const migratedState = migrateImportedBackup(imported);
      const ok = window.confirm(
        "Esto reemplazará los datos actuales por el respaldo importado. También intentará adaptar respaldos de la versión anterior."
      );
      if (!ok) return;
      setAppState(migratedState);
      resetExerciseDraft();
      alert("Respaldo importado correctamente.");
    } catch {
      alert("No se pudo importar el archivo. Verifica que sea un respaldo válido.");
    }
  };

  const calendarCells = useMemo(() => {
    const year = appState.ui.calendarYear;
    const month = appState.ui.calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = todayKey();
    let startOffset = firstDay.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    const cells: React.ReactNode[] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((weekday) => (
      <div key={`head-${weekday}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-center text-sm text-slate-400">
        {weekday}
      </div>
    ));

    for (let i = 0; i < startOffset; i++) {
      cells.push(
        <div key={`empty-${i}`} className="rounded-xl border border-slate-900 bg-slate-950/40 p-3 opacity-30" />
      );
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const done = appState.completedDates.includes(key);
      const isToday = key === today;
      cells.push(
        <button
          key={key}
          type="button"
          title={formatDateKey(key)}
          onClick={() => done && setSelectedCalendarDate(key)}
          className={cx(
            "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border bg-slate-950/70 p-2 text-center",
            done ? "border-emerald-500/40 cursor-pointer" : "border-slate-800 cursor-default",
            isToday && "border-sky-400/40"
          )}
        >
          <div className="text-sm font-medium text-slate-100">{day}</div>
          {done && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
        </button>
      );
    }

    return cells;
  }, [appState.ui.calendarYear, appState.ui.calendarMonth, appState.completedDates]);

  if (!ready) {
    return <div className="p-6 text-slate-200">Cargando Gym Tracker…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24">
        {needRefresh && (
          <UpdateBanner
            onReload={() => {
              setNeedRefresh(false);
              void updateServiceWorker(true);
            }}
          />
        )}
        <section className="mb-4 rounded-[28px] border border-slate-700 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 p-5 shadow-2xl">
          <h1 className="text-3xl font-bold text-white">Gym Tracker</h1>
        </section>

        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <TabButton active={appState.ui.activeTab === "train"} label="Entrenar" icon={Play} onClick={() => updateUi({ activeTab: "train" })} />
          <TabButton active={appState.ui.activeTab === "routines"} label="Rutinas" icon={NotebookPen} onClick={() => updateUi({ activeTab: "routines" })} />
          <TabButton active={appState.ui.activeTab === "calendar"} label="Calendario" icon={CalendarDays} onClick={() => updateUi({ activeTab: "calendar" })} />
          <TabButton active={appState.ui.activeTab === "history"} label="Historial" icon={History} onClick={() => updateUi({ activeTab: "history" })} />
          <TabButton active={appState.ui.activeTab === "backup"} label="Respaldo" icon={DatabaseBackup} onClick={() => updateUi({ activeTab: "backup" })} />
        </div>

        {appState.ui.activeTab === "train" && (
          <div className="space-y-4">
            <Section title="Elegir rutina" right={<span className="text-sm text-slate-400">{appState.routines.length} rutinas disponibles</span>}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <select
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                  value={appState.currentSession.routineId || ""}
                  onChange={(e) => {
                    const selectedId = e.target.value || null;
                    const selectedRoutine = appState.routines.find((routine) => routine.id === selectedId);
                    updateCurrentSession({
                      routineId: selectedId,
                      routineName: selectedRoutine?.name || null,
                    });
                  }}
                >
                  <option value="">Selecciona una rutina…</option>
                  {appState.routines.map((routine) => (
                    <option key={routine.id} value={routine.id}>
                      {routine.name} ({routine.exercises.length})
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-white"
                  disabled={!appState.currentSession.routineId}
                  onClick={() => appState.currentSession.routineId && applyRoutine(appState.currentSession.routineId)}
                >
                  Cargar rutina
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Si la sesión ya tiene ejercicios, te preguntará si quieres reemplazarlos o agregarlos al final.
              </p>
            </Section>

            <Section
              title="Sesión actual"
              right={
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-2xl bg-emerald-500 px-4 py-2 font-medium text-white"
                    onClick={() =>
                      updateCurrentSession({
                        date: todayKey(),
                        startTime: nowIso(),
                        endTime: null,
                      })
                    }
                  >
                    Marcar inicio ahora
                  </button>
                  <button
                    className="rounded-2xl bg-amber-500 px-4 py-2 font-medium text-slate-950"
                    onClick={() => {
                      addCompletedDate(appState.currentSession.date || todayKey());
                      updateCurrentSession({ endTime: nowIso() });
                    }}
                  >
                    Marcar fin ahora
                  </button>
                  <button className="rounded-2xl bg-slate-700 px-4 py-2 font-medium text-white" onClick={archiveSession}>
                    Guardar en historial
                  </button>
                  <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" onClick={createNewSession}>
                    Nueva sesión
                  </button>
                </div>
              }
            >
              <div className="grid gap-3 md:grid-cols-5">
                <StatCard label="Fecha" value={formatDateKey(appState.currentSession.date)} />
                <StatCard label="Inicio" value={formatTime(appState.currentSession.startTime)} />
                <StatCard label="Fin" value={formatTime(appState.currentSession.endTime)} />
                <StatCard label="Ejercicios listos" value={`${doneCount} / ${appState.currentSession.exercises.length}`} />
                <StatCard label="Peso corporal" value={appState.currentSession.bodyweight !== null ? `${appState.currentSession.bodyweight} kg` : "—"} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Rutina seleccionada: {appState.currentSession.routineName || "Ninguna"}
                </span>
                <button
                  className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white"
                  onClick={() => updateCurrentSession({ routineId: null, routineName: null })}
                >
                  Quitar selección
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="text-sm text-slate-300">
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <Clock3 className="h-4 w-4" /> Inicio manual
                  </div>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                    type="datetime-local"
                    value={isoToDatetimeLocal(appState.currentSession.startTime)}
                    onChange={(e) =>
                      updateCurrentSession({
                        startTime: datetimeLocalToIso(e.target.value),
                        date: localDateFromDatetimeLocal(e.target.value) || appState.currentSession.date,
                      })
                    }
                  />
                </label>
                <label className="text-sm text-slate-300">
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <Clock3 className="h-4 w-4" /> Fin manual
                  </div>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                    type="datetime-local"
                    value={isoToDatetimeLocal(appState.currentSession.endTime)}
                    onChange={(e) =>
                      updateCurrentSession({
                        endTime: datetimeLocalToIso(e.target.value),
                        date: localDateFromDatetimeLocal(e.target.value) || appState.currentSession.date,
                      })
                    }
                  />
                </label>
                <label className="text-sm text-slate-300">
                  <div className="mb-2 text-slate-400">Peso corporal</div>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                    type="number"
                    step="0.1"
                    placeholder="Ej: 82.4"
                    value={appState.currentSession.bodyweight ?? ""}
                    onChange={(e) => updateCurrentSession({ bodyweight: toNumberOrNull(e.target.value) })}
                  />
                </label>
                <div className="flex items-end">
                  <div className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-center text-sm text-slate-400">
                    Guardado local automático
                  </div>
                </div>
              </div>
            </Section>

            <div className="grid gap-4 lg:grid-cols-[430px_1fr]">
              <Section
                title="Agregar ejercicio manualmente"
                right={
                  <button
                    className="rounded-2xl bg-slate-700 px-4 py-2 text-sm text-white"
                    onClick={() => updateUi({ isExerciseFormOpen: !appState.ui.isExerciseFormOpen })}
                  >
                    <span className="inline-flex items-center gap-2">
                      {appState.ui.isExerciseFormOpen ? "Ocultar formulario" : "Mostrar formulario"}
                      <ChevronDown className={cx("h-4 w-4 transition", appState.ui.isExerciseFormOpen && "rotate-180")} />
                    </span>
                  </button>
                }
              >
                <p className="mb-3 text-sm text-slate-400">
                  Úsalo solo cuando necesites agregar ejercicios fuera de la rutina ya cargada.
                </p>

                {appState.ui.isExerciseFormOpen && (
                  <div className="space-y-4">
                    <div className="relative">
                      <label className="mb-2 block text-sm text-slate-400">Nombre del ejercicio</label>
                      <input
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                        value={exerciseDraft.name}
                        onChange={(e) => setExerciseDraft((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Ej: Press de piernas"
                        autoComplete="off"
                      />
                      {!!exerciseSuggestions.length && exerciseDraft.name.trim() && (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
                          {exerciseSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.name}
                              className="block w-full rounded-xl px-3 py-2 text-left hover:bg-sky-500/10"
                              type="button"
                              onClick={() => applyExerciseTemplate(suggestion)}
                            >
                              <div className="font-medium text-white">{suggestion.name}</div>
                              <div className="text-xs text-slate-400">
                                {suggestion.configs.length} ajustes · {suggestion.images.length} imágenes
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-slate-500">
                        Si coincide con uno existente, puedes heredar sus ajustes de máquina e imágenes.
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label>
                        <div className="mb-2 text-sm text-slate-400">Orden (opcional)</div>
                        <input className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3" value={exerciseDraft.order} onChange={(e) => setExerciseDraft((prev) => ({ ...prev, order: e.target.value }))} />
                      </label>
                      <label>
                        <div className="mb-2 text-sm text-slate-400">Peso (opcional)</div>
                        <input className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3" value={exerciseDraft.weight} onChange={(e) => setExerciseDraft((prev) => ({ ...prev, weight: e.target.value }))} />
                      </label>
                      <label>
                        <div className="mb-2 text-sm text-slate-400">Repeticiones (opcional)</div>
                        <input className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3" value={exerciseDraft.reps} onChange={(e) => setExerciseDraft((prev) => ({ ...prev, reps: e.target.value }))} />
                      </label>
                      <label>
                        <div className="mb-2 text-sm text-slate-400">Tiempo (opcional)</div>
                        <input className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3" value={exerciseDraft.time} onChange={(e) => setExerciseDraft((prev) => ({ ...prev, time: e.target.value }))} />
                      </label>
                      <label className="md:col-span-2">
                        <div className="mb-2 text-sm text-slate-400">Series (opcional)</div>
                        <input className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3" value={exerciseDraft.sets} onChange={(e) => setExerciseDraft((prev) => ({ ...prev, sets: e.target.value }))} />
                      </label>
                    </div>

                    <label>
                      <div className="mb-2 text-sm text-slate-400">Notas</div>
                      <textarea
                        className="min-h-[100px] w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                        value={exerciseDraft.notes}
                        onChange={(e) => setExerciseDraft((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </label>

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-300">Configuración de máquina (opcional)</div>
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input
                          className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                          placeholder="Ej: Respaldo"
                          value={configDraft.key}
                          onChange={(e) => setConfigDraft((prev) => ({ ...prev, key: e.target.value }))}
                        />
                        <input
                          className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                          placeholder="Ej: 5"
                          value={configDraft.value}
                          onChange={(e) => setConfigDraft((prev) => ({ ...prev, value: e.target.value }))}
                        />
                        <button className="rounded-2xl bg-sky-500 px-4 py-3 font-medium text-white" onClick={addConfig}>
                          Agregar
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingConfigs.length ? (
                          pendingConfigs.map((cfg) => (
                            <div key={cfg.id} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                              <span>
                                <strong>{cfg.key}:</strong> {cfg.value}
                              </span>
                              <button onClick={() => setPendingConfigs((prev) => prev.filter((item) => item.id !== cfg.id))}>
                                <X className="h-4 w-4 text-rose-300" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">Aún no agregas configuraciones para este ejercicio.</div>
                        )}
                      </div>
                    </div>

                    {(pendingConfigs.length > 0 || pendingTemplateImages.length > 0) && (
                      <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                        Se cargaron datos desde un ejercicio existente.
                      </div>
                    )}

                    {pendingTemplateImages.length > 0 && (
                      <div>
                        <div className="mb-2 text-sm font-medium text-slate-300">Imágenes heredadas</div>
                        <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
                          {pendingTemplateImages.map((image, index) => (
                            <div key={`template-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                              <img src={image} alt={`heredada-${index}`} className="aspect-square w-full cursor-zoom-in object-cover" onClick={() => setLightboxImage(image)} />
                              <button className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white" onClick={() => setPendingTemplateImages((prev) => prev.filter((_, idx) => idx !== index))}>
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-300">Imágenes referenciales</div>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600 bg-slate-950/70 px-4 py-6 text-slate-300">
                        <ImageIcon className="h-4 w-4" />
                        <span>{uploadFiles.length ? `${uploadFiles.length} imágenes seleccionadas` : "Elegir imágenes"}</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                        />
                      </label>
                    </div>

                    <button className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-white" onClick={saveExercise}>
                      Guardar ejercicio
                    </button>
                  </div>
                )}
              </Section>

              <Section
                title="Ejercicios de hoy"
                right={
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white" onClick={() => updateUi({ sortMode: "order" })}>
                      Ordenar por orden
                    </button>
                    <button className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white" onClick={() => updateUi({ sortMode: "status" })}>
                      Pendientes primero
                    </button>
                    <button
                      className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        if (!window.confirm("Se borrarán solo los ejercicios de la sesión actual.")) return;
                        updateCurrentSession({
                          exercises: [],
                          startTime: null,
                          endTime: null,
                          bodyweight: null,
                          routineId: null,
                          routineName: null,
                        });
                      }}
                    >
                      Vaciar sesión
                    </button>
                  </div>
                }
              >
                <p className="mb-3 text-sm text-slate-400">
                  Puedes completar ejercicios en cualquier orden. El número sigue representando el orden planificado.
                </p>

                <div className="space-y-4">
                  {sortedExercises.length ? (
                    sortedExercises.map((exercise) => (
                      <ExerciseCard
                        key={exercise.id}
                        exercise={exercise}
                        mode="current"
                        onToggleDone={() =>
                          updateCurrentSession({
                            exercises: appState.currentSession.exercises.map((item) => {
                              if (item.id !== exercise.id) return item;
                              const nextDone = !item.done;
                              return {
                                ...item,
                                done: nextDone,
                                doneAt: nextDone ? nowIso() : null,
                                completedSets: nextDone ? item.sets ?? 0 : 0,
                              };
                            }),
                          })
                        }
                        onCompleteSet={() =>
                          updateCurrentSession({
                            exercises: appState.currentSession.exercises.map((item) => {
                              if (item.id !== exercise.id || !item.sets) return item;
                              const completedSets = Math.min(item.completedSets + 1, item.sets);
                              const done = completedSets >= item.sets;
                              return {
                                ...item,
                                completedSets,
                                done,
                                doneAt: done ? nowIso() : null,
                              };
                            }),
                          })
                        }
                        onUndoSet={() =>
                          updateCurrentSession({
                            exercises: appState.currentSession.exercises.map((item) => {
                              if (item.id !== exercise.id || !item.sets) return item;
                              const completedSets = Math.max(item.completedSets - 1, 0);
                              return {
                                ...item,
                                completedSets,
                                done: false,
                                doneAt: null,
                              };
                            }),
                          })
                        }
                        onDelete={() =>
                          updateCurrentSession({
                            exercises: normalizeExerciseOrders(
                              appState.currentSession.exercises.filter((item) => item.id !== exercise.id)
                            ),
                          })
                        }
                        onMoveUp={() => {
                          const ordered = [...appState.currentSession.exercises].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                          const index = ordered.findIndex((item) => item.id === exercise.id);
                          if (index <= 0) return;
                          const currentOrder = ordered[index].order;
                          ordered[index].order = ordered[index - 1].order;
                          ordered[index - 1].order = currentOrder;
                          updateCurrentSession({ exercises: normalizeExerciseOrders([...ordered]) });
                        }}
                        onMoveDown={() => {
                          const ordered = [...appState.currentSession.exercises].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                          const index = ordered.findIndex((item) => item.id === exercise.id);
                          if (index < 0 || index >= ordered.length - 1) return;
                          const currentOrder = ordered[index].order;
                          ordered[index].order = ordered[index + 1].order;
                          ordered[index + 1].order = currentOrder;
                          updateCurrentSession({ exercises: normalizeExerciseOrders([...ordered]) });
                        }}
                        onOpenImage={setLightboxImage}
                        onRemovePhoto={(photoIndex) =>
                          updateCurrentSession({
                            exercises: appState.currentSession.exercises.map((item) =>
                              item.id === exercise.id
                                ? { ...item, images: item.images.filter((_, idx) => idx !== photoIndex) }
                                : item
                            ),
                          })
                        }
                      />
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">Todavía no agregas ejercicios para esta sesión.</div>
                  )}
                </div>
              </Section>
            </div>
          </div>
        )}

        {appState.ui.activeTab === "routines" && (
          <div className="space-y-4">
            <Section title="Crear o actualizar rutina" right={<span className="text-sm text-slate-400">{appState.routines.length} rutinas</span>}>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                  placeholder="Nombre de rutina"
                  value={routineDraft.name}
                  onChange={(e) => setRoutineDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
                <input
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
                  placeholder="Notas de rutina"
                  value={routineDraft.notes}
                  onChange={(e) => setRoutineDraft((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <button className="rounded-2xl bg-violet-500 px-4 py-3 font-medium text-white" onClick={saveRoutine}>
                  Guardar rutina
                </button>
              </div>
            </Section>

            <Section title="Rutinas guardadas" right={<span className="text-sm text-slate-400">{appState.routines.length} rutinas</span>}>
              <div className="space-y-4">
                {appState.routines.length ? (
                  appState.routines.map((routine) => (
                    <div key={routine.id} className="rounded-3xl border border-slate-700 bg-gradient-to-b from-slate-800/95 to-slate-900/95 p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                              Plantilla
                            </span>
                            <span className="text-lg font-semibold text-white">{routine.name}</span>
                            {appState.currentSession.routineId === routine.id && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                                Seleccionada
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-slate-400">
                            {routine.exercises.length} ejercicios · Actualizada {formatDateTime(routine.updatedAt)}
                          </div>
                          <div className="mt-1 text-sm text-slate-300">{routine.notes || "Sin notas."}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white" onClick={() => applyRoutine(routine.id)}>
                            Usar en sesión
                          </button>
                          <button
                            className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white"
                            onClick={() => {
                              if (!window.confirm("Se eliminará esta rutina guardada.")) return;
                              setAppState((prev) => ({
                                ...prev,
                                routines: prev.routines.filter((item) => item.id !== routine.id),
                                currentSession:
                                  prev.currentSession.routineId === routine.id
                                    ? { ...prev.currentSession, routineId: null, routineName: null }
                                    : prev.currentSession,
                              }));
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      <details className="rounded-2xl border border-slate-700 bg-slate-950/40 p-3">
                        <summary className="cursor-pointer font-medium text-white">Ver ejercicios</summary>
                        <div className="mt-4 space-y-4">
                          {routine.exercises.map((exercise) => (
                            <ExerciseCard
                              key={exercise.id}
                              exercise={exercise}
                              mode="routine"
                              onCopy={() =>
                                updateCurrentSession({
                                  exercises: normalizeExerciseOrders([
                                    ...appState.currentSession.exercises,
                                    cloneExerciseForSession(exercise, nextOrder),
                                  ]),
                                })
                              }
                              onOpenImage={setLightboxImage}
                            />
                          ))}
                        </div>
                      </details>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">Todavía no guardas rutinas.</div>
                )}
              </div>
            </Section>
          </div>
        )}

        {appState.ui.activeTab === "calendar" && (
          <Section title="Calendario de entrenamiento">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <button
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm text-white"
                onClick={() => {
                  const month = appState.ui.calendarMonth - 1;
                  if (month < 0) {
                    updateUi({ calendarMonth: 11, calendarYear: appState.ui.calendarYear - 1 });
                  } else {
                    updateUi({ calendarMonth: month });
                  }
                }}
              >
                ◀ Mes anterior
              </button>
              <div className="text-lg font-semibold">{calendarMonthLabel}</div>
              <button
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm text-white"
                onClick={() => {
                  const month = appState.ui.calendarMonth + 1;
                  if (month > 11) {
                    updateUi({ calendarMonth: 0, calendarYear: appState.ui.calendarYear + 1 });
                  } else {
                    updateUi({ calendarMonth: month });
                  }
                }}
              >
                Mes siguiente ▶
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">{calendarCells}</div>

            <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950/50 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-white">Historial de peso corporal</h3>
                  <div className="text-sm text-slate-400">{weightSeries.length} registros</div>
                </div>
              </div>

              {weightSeries.length ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.15)" />
                      <XAxis dataKey="fecha" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="peso" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Guarda sesiones con peso corporal para ver la evolución aquí.</div>
              )}
            </div>
          </Section>
        )}

        {appState.ui.activeTab === "history" && (
          <Section title="Historial" right={<span className="text-sm text-slate-400">{appState.historySessions.length} sesiones</span>}>
            <div className="space-y-4">
              {appState.historySessions.length ? (
                appState.historySessions.map((session) => {
                  const completed = session.exercises.filter((exercise) => exercise.done).length;
                  return (
                    <div key={session.id} className="rounded-3xl border border-slate-700 bg-gradient-to-b from-slate-800/95 to-slate-900/95 p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                              {formatDateKey(session.date)}
                            </span>
                            <span className="font-semibold text-white">{session.exercises.length} ejercicios</span>
                          </div>
                          <div className="mt-2 text-sm text-slate-400">
                            Inicio {formatTime(session.startTime)} · Fin {formatTime(session.endTime)} · Peso {session.bodyweight !== null ? `${session.bodyweight} kg` : "—"} · Rutina {session.routineName || "Libre"} · Completados {completed}/{session.exercises.length}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-xl bg-slate-700 px-3 py-2 text-sm text-white"
                            onClick={() =>
                              setAppState((prev) => ({
                                ...prev,
                                currentSession: {
                                  ...prev.currentSession,
                                  routineId: session.routineId,
                                  routineName: session.routineName,
                                  exercises: normalizeExerciseOrders([
                                    ...prev.currentSession.exercises,
                                    ...session.exercises.map((exercise, index) =>
                                      cloneExerciseForSession(exercise, nextOrder + index)
                                    ),
                                  ]),
                                },
                                ui: { ...prev.ui, activeTab: "train" },
                              }))
                            }
                          >
                            Copiar sesión completa
                          </button>
                          <button
                            className="rounded-xl bg-rose-500 px-3 py-2 text-sm text-white"
                            onClick={() => {
                              if (!window.confirm("Se eliminará esta sesión del historial.")) return;
                              setAppState((prev) => {
                                const historySessions = prev.historySessions.filter((item) => item.id !== session.id);
                                const completedDates = [
                                  ...new Set(historySessions.filter((item) => item.exercises.length).map((item) => item.date)),
                                ];
                                return { ...prev, historySessions, completedDates };
                              });
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      <details className="rounded-2xl border border-slate-700 bg-slate-950/40 p-3">
                        <summary className="cursor-pointer font-medium text-white">Ver ejercicios</summary>
                        <div className="mt-4 space-y-4">
                          {session.exercises.map((exercise) => (
                            <ExerciseCard
                              key={exercise.id}
                              exercise={exercise}
                              mode="history"
                              onCopy={() =>
                                updateCurrentSession({
                                  exercises: normalizeExerciseOrders([
                                    ...appState.currentSession.exercises,
                                    cloneExerciseForSession(exercise, nextOrder),
                                  ]),
                                })
                              }
                              onOpenImage={setLightboxImage}
                            />
                          ))}
                        </div>
                      </details>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-500">Todavía no hay sesiones en el historial.</div>
              )}
            </div>
          </Section>
        )}

        {appState.ui.activeTab === "backup" && (
          <Section title="Respaldo y sincronización manual">
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-sky-500 px-4 py-3 font-medium text-white" onClick={exportBackup}>
                Exportar respaldo
              </button>
              <button className="rounded-2xl bg-violet-500 px-4 py-3 font-medium text-white" onClick={() => fileImportRef.current?.click()}>
                Importar respaldo
              </button>
              <input
                ref={fileImportRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importBackup(e.target.files?.[0] || null)}
              />
            </div>
          </Section>
        )}
      </div>

      {selectedCalendarDate && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setSelectedCalendarDate(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-bold text-white">{formatDateKey(selectedCalendarDate)}</h3>
                <p className="text-sm text-slate-400">{selectedCalendarSessions.length} sesión(es) registrada(s)</p>
              </div>
              <button className="rounded-full bg-rose-500 p-2 text-white" onClick={() => setSelectedCalendarDate(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {selectedCalendarSessions.length ? (
                selectedCalendarSessions.map((session) => {
                  const completed = session.exercises.filter((exercise) => exercise.done).length;
                  const preview = session.exercises.slice(0, 3).map((exercise) => exercise.name).join(", ");
                  return (
                    <div key={session.id} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                          {session.routineName || "Rutina libre"}
                        </span>
                        <span className="text-sm text-slate-400">
                          {formatTime(session.startTime)} - {formatTime(session.endTime)}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <StatCard label="Ejercicios" value={session.exercises.length} />
                        <StatCard label="Completados" value={`${completed}/${session.exercises.length}`} />
                        <StatCard label="Peso corporal" value={session.bodyweight !== null ? `${session.bodyweight} kg` : "—"} />
                        <StatCard label="Resumen" value={preview || "—"} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-500">No hay sesiones guardadas para este día.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-6" onClick={() => setLightboxImage(null)}>
          <button className="absolute right-5 top-5 rounded-full bg-rose-500 p-2 text-white" onClick={() => setLightboxImage(null)}>
            <X className="h-4 w-4" />
          </button>
          <img src={lightboxImage} alt="Imagen ampliada" className="max-h-full max-w-full rounded-3xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
