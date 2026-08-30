"use client";

import HanziWriter from "hanzi-writer";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import hanziWriterCoverage from "@/app/data/hanzi-writer-coverage.json";
import ReaderScreen from "@/app/reader";
import {
  SUTRA_AUDIO_TRACKS,
  normalizeReadingProgress,
  type SavedReadingLibrary,
  type SavedReadingProgress,
} from "@/app/lib/reading";
import {
  diamondSutra,
  getCompletedSectionCount,
  getSectionAt,
  getSectionStatus,
  getSutraCharacters,
  sutras,
  type Sutra,
  type SutraSection,
} from "@/app/lib/sutra";

const STORAGE_KEY = "yizi-yinian-progress-v2";
const LEGACY_STORAGE_KEY = "yizi-yinian-progress-v1";
const PREFERENCES_STORAGE_KEY = "yizi-yinian-preferences-v1";
const READING_STORAGE_KEY = "yizi-yinian-reading-v1";
const FREEHAND_FALLBACK = new Set(hanziWriterCoverage.freehandFallback);

type Handedness = "left" | "right";

type WritingLayout = {
  handedness: Handedness;
  size: number;
  x: number;
  y: number;
};

type SavedPreferences = {
  version: 1;
  guide: boolean;
  gentleHints: boolean;
  autoAdvance: boolean;
  writingLayout: WritingLayout;
};

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type LayoutGesture = {
  mode: "move" | "resize";
  corner?: ResizeCorner;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLayout: WritingLayout;
  workspaceWidth: number;
};

const RESIZE_CORNERS: ReadonlyArray<{
  corner: ResizeCorner;
  label: string;
  symbol: string;
}> = [
  { corner: "top-left", label: "從左上角調整田字格大小", symbol: "↖" },
  { corner: "top-right", label: "從右上角調整田字格大小", symbol: "↗" },
  { corner: "bottom-left", label: "從左下角調整田字格大小", symbol: "↙" },
  { corner: "bottom-right", label: "從右下角調整田字格大小", symbol: "↘" },
];

function writingLayoutPreset(handedness: Handedness): WritingLayout {
  return {
    handedness,
    size: 320,
    x: handedness === "left" ? 0 : 1,
    y: 24,
  };
}

function normalizeWritingLayout(layout: Partial<WritingLayout> | undefined): WritingLayout {
  const handedness = layout?.handedness === "left" ? "left" : "right";
  const preset = writingLayoutPreset(handedness);
  return {
    handedness,
    size: typeof layout?.size === "number" && Number.isFinite(layout.size)
      ? Math.max(220, Math.min(380, layout.size))
      : preset.size,
    x: typeof layout?.x === "number" && Number.isFinite(layout.x)
      ? Math.max(0, Math.min(1, layout.x))
      : preset.x,
    y: typeof layout?.y === "number" && Number.isFinite(layout.y)
      ? Math.max(0, Math.min(140, layout.y))
      : preset.y,
  };
}

type SavedProgress = {
  scriptureId: string;
  characterIndex: number;
  completedCount?: number;
  completedIndices?: number[];
  elapsedSeconds: number;
  updatedAt: string;
};

type SavedLibrary = {
  version: 2;
  activeScriptureId: string;
  progresses: Record<string, SavedProgress>;
};

const SUTRA_PRESENTATION: Record<string, {
  coverLines: [string, string];
  description: string;
  verse: [string, string];
  theme: string;
}> = {
  "diamond-sutra": {
    coverLines: ["金剛般若", "波羅蜜經"],
    description: "從「如是我聞」開始，一字一念。建議每次抄寫 10–20 分鐘。",
    verse: ["應無所住，", "而生其心。"],
    theme: "diamond",
  },
  "heart-sutra": {
    coverLines: ["般若波羅蜜多", "心經"],
    description: "二百六十字，篇幅精要。適合在一段安靜時間裡完整抄寫。",
    verse: ["照見五蘊皆空，", "度一切苦厄。"],
    theme: "heart",
  },
};

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

function formatSectionNumber(value: number) {
  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value];
  if (value === 10) return "十";
  if (value < 20) return `十${digits[value - 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens]}十${digits[ones]}`;
}

function sectionLabel(sutra: Sutra, section: SutraSection) {
  if (sutra.sections.length === 1) return `全${sutra.sectionUnit}`;
  return `第${formatSectionNumber(section.id)}${sutra.sectionUnit}`;
}

function writingPromptFor(character: string) {
  return FREEHAND_FALLBACK.has(character)
    ? "此異體字暫無筆順校驗，請依淡墨字形書寫"
    : "依照淡墨字形，緩緩落筆";
}

function emptyProgress(scriptureId: string): SavedProgress {
  return {
    scriptureId,
    characterIndex: 0,
    completedIndices: [],
    elapsedSeconds: 0,
    updatedAt: "",
  };
}

function normalizeProgress(progress: SavedProgress | undefined, scripture: Sutra): SavedProgress {
  const totalCharacters = scripture.characterCount;
  if (!progress) return emptyProgress(scripture.id);
  const restored = Array.isArray(progress.completedIndices)
    ? progress.completedIndices
    : Array.from(
        { length: Math.max(0, Math.min(progress.completedCount ?? 0, totalCharacters)) },
        (_, index) => index,
      );
  return {
    ...progress,
    scriptureId: scripture.id,
    characterIndex: Math.max(0, Math.min(progress.characterIndex || 0, totalCharacters - 1)),
    completedIndices: Array.from(
      new Set(
        restored.filter(
          (index) => Number.isInteger(index) && index >= 0 && index < totalCharacters,
        ),
      ),
    ).sort((left, right) => left - right),
    elapsedSeconds: Math.max(0, progress.elapsedSeconds || 0),
  };
}

type FreehandWriterProps = {
  character: string;
  guide: boolean;
  resetVersion: number;
  onComplete: () => void;
};

function FreehandWriter({ character, guide, resetVersion, onComplete }: FreehandWriterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pointerRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#25342b";
      context.lineWidth = Math.max(7, bounds.width / 46);
      contextRef.current = context;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [character, resetVersion]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = event.pointerId;
    const position = point(event);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(position.x, position.y);
  };
  const drawStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const position = point(event);
    contextRef.current?.lineTo(position.x, position.y);
    contextRef.current?.stroke();
  };
  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current === event.pointerId) pointerRef.current = null;
  };

  return (
    <div className="freehand-writer">
      {guide && <span className="freehand-outline" aria-hidden="true">{character}</span>}
      <canvas
        ref={canvasRef}
        aria-label={`自由書寫「${character}」字`}
        onPointerDown={startStroke}
        onPointerMove={drawStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <button type="button" onClick={onComplete}>完成此字</button>
    </div>
  );
}

type LibrarySutraCardProps = {
  scripture: Sutra;
  progress?: SavedProgress;
  readingProgress?: SavedReadingProgress;
  onRead: (scriptureId: string) => void;
  onWrite: (scriptureId: string) => void;
};

function LibrarySutraCard({
  scripture,
  progress,
  readingProgress,
  onRead,
  onWrite,
}: LibrarySutraCardProps) {
  const presentation = SUTRA_PRESENTATION[scripture.id];
  const normalized = normalizeProgress(progress, scripture);
  const completedSet = new Set(normalized.completedIndices);
  const copiedCount = completedSet.size;
  const sutraProgress = Math.round((copiedCount / scripture.characterCount) * 100);
  const currentSection = getSectionAt(scripture, normalized.characterIndex);
  const sectionCountLabel = `${formatSectionNumber(scripture.sections.length)}${scripture.sectionUnit}`;

  return (
    <article className={`scripture-card featured ${presentation.theme}-featured`}>
      <div className={`book-cover ${presentation.theme}-book-cover`}>
        <span>{scripture.translator}</span>
        <strong>{presentation.coverLines[0]}<br />{presentation.coverLines[1]}</strong>
        <i>般若</i>
      </div>
      <div className="book-info">
        <div className="book-meta">
          <span>{sectionCountLabel}</span>
          <span>正文 {scripture.characterCount.toLocaleString("zh-Hant")} 字</span>
          <span>{scripture.script}</span>
        </div>
        <h2>{scripture.title}</h2>
        <p>{presentation.description}</p>
        {copiedCount > 0 ? (
          <div className="continue-progress">
            <div>
              <span>上次抄至</span>
              <strong>{sectionLabel(scripture, currentSection)} · 第 {normalized.characterIndex - currentSection.startIndex + 1} 字</strong>
            </div>
            <span>{sutraProgress}%</span>
            <div className="continue-track"><i style={{ width: `${Math.max(sutraProgress, 1)}%` }} /></div>
          </div>
        ) : (
          <div className="new-book-note">
            尚未開始 · {scripture.sections.length === 1 ? "從卷首起抄" : `從第一${scripture.sectionUnit}起抄`}
          </div>
        )}
        <div className="book-actions">
          <button className="start-reading" type="button" onClick={() => onRead(scripture.id)}>
            {readingProgress?.updatedAt ? "繼續讀經" : "開始讀經"}
          </button>
          <button className="start-writing" type="button" onClick={() => onWrite(scripture.id)}>
            {copiedCount > 0 ? "繼續抄寫" : "開始抄寫"}<span>→</span>
          </button>
        </div>
        <a
          className="source-credit"
          href={scripture.source.url}
          target="_blank"
          rel="noreferrer"
        >經文依據 {scripture.source.label.replace("CBETA《大正新脩大藏經》", "CBETA ")} 校對 ↗</a>
      </div>
    </article>
  );
}

export default function Home() {
  const writerMount = useRef<HTMLDivElement>(null);
  const gridWorkspace = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const layoutGesture = useRef<LayoutGesture | null>(null);
  const readingProgressRef = useRef<Record<string, SavedReadingProgress>>({});
  const [activeScriptureId, setActiveScriptureId] = useState(diamondSutra.id);
  const [progressByScripture, setProgressByScripture] = useState<Record<string, SavedProgress>>({});
  const [readingProgressByScripture, setReadingProgressByScripture] = useState<Record<string, SavedReadingProgress>>({});
  const [resetVersion, setResetVersion] = useState(0);
  const [guide, setGuide] = useState(true);
  const [gentleHints, setGentleHints] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [writingLayout, setWritingLayout] = useState<WritingLayout>(() => writingLayoutPreset("right"));
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"chapters" | "progress" | "settings" | null>(null);
  const [feedback, setFeedback] = useState("依照淡墨字形，緩緩落筆");
  const [screen, setScreen] = useState<"library" | "reading" | "writing">("library");
  const [storageReady, setStorageReady] = useState(false);

  const scripture = sutras.find((item) => item.id === activeScriptureId) ?? diamondSutra;
  const characters = useMemo(() => getSutraCharacters(scripture), [scripture]);
  const totalCharacters = characters.length;
  const activeProgress = useMemo(
    () => progressByScripture[scripture.id] ?? emptyProgress(scripture.id),
    [progressByScripture, scripture.id],
  );
  const activeReadingProgress = useMemo(
    () => normalizeReadingProgress(readingProgressByScripture[scripture.id], scripture.id),
    [readingProgressByScripture, scripture.id],
  );
  const characterIndex = activeProgress.characterIndex;
  const seconds = activeProgress.elapsedSeconds;
  const completedIndices = useMemo(
    () => activeProgress.completedIndices ?? [],
    [activeProgress.completedIndices],
  );
  const currentCharacter = characters[characterIndex];
  const usesFreehandFallback = FREEHAND_FALLBACK.has(currentCharacter);
  const currentSection = getSectionAt(scripture, characterIndex);
  const completedSet = useMemo(() => new Set(completedIndices), [completedIndices]);
  const copiedCount = completedSet.size;
  const sutraProgress = Math.round((copiedCount / totalCharacters) * 100);
  const completedSectionCount = useMemo(
    () => getCompletedSectionCount(scripture, completedSet),
    [completedSet, scripture],
  );
  const sourceWindowStart = Math.max(
    0,
    Math.min(characterIndex - 9, Math.max(0, totalCharacters - 22)),
  );
  const sourceCharacters = characters.slice(
    sourceWindowStart,
    sourceWindowStart + 22,
  );
  const writingGridStyle = {
    "--writing-grid-size": `${writingLayout.size}px`,
    "--writing-grid-x": `${writingLayout.x * 100}%`,
    "--writing-grid-shift": `${writingLayout.x * -100}%`,
    "--writing-grid-y": `${writingLayout.y}px`,
  } as CSSProperties;

  const updateActiveProgress = useCallback(
    (updater: (progress: SavedProgress) => SavedProgress) => {
      setProgressByScripture((values) => {
        const current = normalizeProgress(values[scripture.id], scripture);
        return {
          ...values,
          [scripture.id]: {
            ...updater(current),
            scriptureId: scripture.id,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [scripture],
  );

  const updateReadingProgress = useCallback(
    (scriptureId: string, patch: Partial<SavedReadingProgress>) => {
      const values = readingProgressRef.current;
      const current = normalizeReadingProgress(values[scriptureId], scriptureId);
      const next = {
        ...values,
        [scriptureId]: {
          ...current,
          ...patch,
          scriptureId,
          updatedAt: new Date().toISOString(),
        },
      };
      readingProgressRef.current = next;
      setReadingProgressByScripture(next);
    },
    [],
  );

  const persistReadingProgress = useCallback(() => {
    const library: SavedReadingLibrary = {
      version: 1,
      progresses: readingProgressRef.current,
    };
    try {
      window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(library));
    } catch {
      // Reading remains available when local storage is unavailable.
    }
  }, []);

  const moveTo = useCallback((nextIndex: number) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const safeIndex = Math.max(0, Math.min(nextIndex, totalCharacters - 1));
    updateActiveProgress((value) => ({ ...value, characterIndex: safeIndex }));
    setFeedback(writingPromptFor(characters[safeIndex]));
  }, [characters, totalCharacters, updateActiveProgress]);

  const completeCurrentCharacter = useCallback(() => {
    updateActiveProgress((value) => {
      const completed = value.completedIndices ?? [];
      return completed.includes(characterIndex)
        ? value
        : {
            ...value,
            completedCount: completed.length + 1,
            completedIndices: [...completed, characterIndex].sort((left, right) => left - right),
          };
    });
    if (characterIndex === totalCharacters - 1) {
      setFeedback("全經抄寫圓滿，願此刻清淨安穩");
      return;
    }
    if (!autoAdvance) {
      setFeedback("此字已完成，可手動進入下一字");
      return;
    }
    setFeedback("寫得很好，停一息，進入下一字");
    const nextIndex = Math.min(characterIndex + 1, totalCharacters - 1);
    advanceTimer.current = window.setTimeout(() => {
      updateActiveProgress((value) => ({ ...value, characterIndex: nextIndex }));
      setFeedback(writingPromptFor(characters[nextIndex]));
    }, 850);
  }, [autoAdvance, characterIndex, characters, totalCharacters, updateActiveProgress]);

  const chooseHandedness = (handedness: Handedness) => {
    setWritingLayout((value) => ({
      ...value,
      handedness,
      x: handedness === "left" ? 0 : 1,
      y: Math.max(value.y, 24),
    }));
  };

  const beginLayoutGesture = (
    mode: LayoutGesture["mode"],
    event: ReactPointerEvent<HTMLElement>,
    corner?: ResizeCorner,
  ) => {
    if (!layoutEditing || !gridWorkspace.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    layoutGesture.current = {
      mode,
      corner,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayout: writingLayout,
      workspaceWidth: gridWorkspace.current.clientWidth,
    };
  };

  const updateLayoutGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = layoutGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startClientX;
    const deltaY = event.clientY - gesture.startClientY;

    if (gesture.mode === "move") {
      const renderedSize = Math.min(gesture.startLayout.size, gesture.workspaceWidth);
      const travel = Math.max(0, gesture.workspaceWidth - renderedSize);
      const left = Math.max(0, Math.min(travel, gesture.startLayout.x * travel + deltaX));
      setWritingLayout({
        ...gesture.startLayout,
        x: travel > 0 ? left / travel : 0.5,
        y: Math.max(0, Math.min(140, gesture.startLayout.y + deltaY)),
      });
      return;
    }

    const corner = gesture.corner ?? "bottom-right";
    const startsAtLeft = corner.endsWith("left");
    const startsAtTop = corner.startsWith("top");
    const horizontalDelta = startsAtLeft ? -deltaX : deltaX;
    const verticalDelta = startsAtTop ? -deltaY : deltaY;
    const resizeDelta = Math.abs(horizontalDelta) > Math.abs(verticalDelta)
      ? horizontalDelta
      : verticalDelta;
    const startSize = Math.min(gesture.startLayout.size, gesture.workspaceWidth);
    const startTravel = Math.max(0, gesture.workspaceWidth - startSize);
    const startLeft = gesture.startLayout.x * startTravel;
    const horizontalAnchorLimit = startsAtLeft
      ? startLeft + startSize
      : gesture.workspaceWidth - startLeft;
    const verticalAnchorLimit = startsAtTop
      ? gesture.startLayout.y + startSize
      : 380;
    const minimumSize = Math.min(220, gesture.workspaceWidth);
    const maximumSize = Math.max(
      minimumSize,
      Math.min(380, gesture.workspaceWidth, horizontalAnchorLimit, verticalAnchorLimit),
    );
    const size = Math.max(minimumSize, Math.min(maximumSize, startSize + resizeDelta));
    const left = startsAtLeft ? startLeft + startSize - size : startLeft;
    const top = startsAtTop
      ? Math.max(0, Math.min(140, gesture.startLayout.y + startSize - size))
      : gesture.startLayout.y;
    const travel = Math.max(0, gesture.workspaceWidth - size);
    setWritingLayout({
      ...gesture.startLayout,
      size,
      x: travel > 0 ? Math.max(0, Math.min(1, left / travel)) : 0.5,
      y: top,
    });
  };

  const endLayoutGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (layoutGesture.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    layoutGesture.current = null;
  };

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  useEffect(() => {
    const restoreFrame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const library = saved ? JSON.parse(saved) as SavedLibrary : null;
        const restored: Record<string, SavedProgress> = {};
        for (const item of sutras) {
          if (library?.version === 2 && library.progresses?.[item.id]) {
            restored[item.id] = normalizeProgress(library.progresses[item.id], item);
          }
        }

        const legacySaved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!restored[diamondSutra.id] && legacySaved) {
          const legacy = JSON.parse(legacySaved) as SavedProgress;
          if (legacy.scriptureId === diamondSutra.id) {
            restored[diamondSutra.id] = normalizeProgress(legacy, diamondSutra);
          }
        }

        setProgressByScripture(restored);
        const restoredScripture = sutras.find((item) => item.id === library?.activeScriptureId)
          ?? sutras
            .filter((item) => restored[item.id]?.updatedAt)
            .sort((left, right) => restored[right.id].updatedAt.localeCompare(restored[left.id].updatedAt))[0]
          ?? diamondSutra;
        setActiveScriptureId(restoredScripture.id);
        const restoredProgress = restored[restoredScripture.id] ?? emptyProgress(restoredScripture.id);
        const restoredCharacters = getSutraCharacters(restoredScripture);
        setFeedback(writingPromptFor(restoredCharacters[restoredProgress.characterIndex]));
      } catch {
        // Private browsing may disable storage; the writing surface still works.
      }

      try {
        const savedReading = window.localStorage.getItem(READING_STORAGE_KEY);
        const readingLibrary = savedReading
          ? JSON.parse(savedReading) as Partial<SavedReadingLibrary>
          : null;
        if (readingLibrary?.version === 1 && readingLibrary.progresses) {
          const restoredReading: Record<string, SavedReadingProgress> = {};
          for (const item of sutras) {
            if (readingLibrary.progresses[item.id]) {
              restoredReading[item.id] = normalizeReadingProgress(
                readingLibrary.progresses[item.id],
                item.id,
              );
            }
          }
          readingProgressRef.current = restoredReading;
          setReadingProgressByScripture(restoredReading);
        }
      } catch {
        // Reading progress is optional and can safely restart at the beginning.
      }

      try {
        const savedPreferences = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
        const preferences = savedPreferences
          ? JSON.parse(savedPreferences) as Partial<SavedPreferences>
          : null;
        if (preferences?.version === 1) {
          if (typeof preferences.guide === "boolean") setGuide(preferences.guide);
          if (typeof preferences.autoAdvance === "boolean") setAutoAdvance(preferences.autoAdvance);
          if (typeof preferences.gentleHints === "boolean") setGentleHints(preferences.gentleHints);
          setWritingLayout(normalizeWritingLayout(preferences.writingLayout));
        }
      } catch {
        // Ignore damaged or unavailable preference storage and keep safe defaults.
      }
      setStorageReady(true);
    });
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  useEffect(() => {
    if (screen !== "writing") return;
    const timer = window.setInterval(() => {
      updateActiveProgress((value) => ({ ...value, elapsedSeconds: value.elapsedSeconds + 1 }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, updateActiveProgress]);

  useEffect(() => {
    if (!storageReady) return;
    const library: SavedLibrary = {
      version: 2,
      activeScriptureId: scripture.id,
      progresses: progressByScripture,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch {
      // Storage is an enhancement, never a blocker for the writing surface.
    }
  }, [progressByScripture, scripture.id, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const library: SavedReadingLibrary = {
      version: 1,
      progresses: readingProgressByScripture,
    };
    try {
      window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(library));
    } catch {
      // Reading remains available when local storage is unavailable.
    }
  }, [readingProgressByScripture, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const preferences: SavedPreferences = {
      version: 1,
      guide,
      autoAdvance,
      gentleHints,
      writingLayout,
    };
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preference persistence is optional; writing remains available without it.
    }
  }, [autoAdvance, gentleHints, guide, storageReady, writingLayout]);

  useEffect(() => {
    const mount = writerMount.current;
    if (!mount || !currentCharacter || screen !== "writing" || usesFreehandFallback) return;

    mount.innerHTML = "";
    const size = Math.min(mount.clientWidth || 380, 380);
    const instance = HanziWriter.create(mount, currentCharacter, {
      width: size,
      height: size,
      padding: 28,
      showCharacter: false,
      showOutline: guide,
      outlineColor: "#c9c1b1",
      strokeColor: "#26312a",
      drawingColor: "#25342b",
      drawingWidth: 8,
      strokeAnimationSpeed: 0.8,
      delayBetweenStrokes: 160,
      highlightColor: "#a8483f",
      charDataLoader: async (character) => {
        const dataUrl = new URL(
          `hanzi-data/${encodeURIComponent(character)}.json`,
          window.location.href,
        );
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`Character data unavailable: ${character}`);
        return response.json();
      },
    });

    writer.current = instance;
    instance.quiz({
      showHintAfterMisses: gentleHints ? 2 : false,
      highlightOnComplete: false,
      leniency: 1.25,
      onMistake: (data) => {
        setFeedback(
          data.totalMistakes > 1
            ? "不急，看看淡墨提示，再試這一筆"
            : "這一筆可以再靠近字形一些",
        );
      },
      onCorrectStroke: (data) => {
        setFeedback(`很好，已完成${data.strokesRemaining === 0 ? "最後一" : "這一"}筆`);
      },
      onComplete: () => {
        completeCurrentCharacter();
      },
    });

    return () => {
      instance.cancelQuiz();
      mount.innerHTML = "";
    };
  }, [
    characterIndex,
    completeCurrentCharacter,
    currentCharacter,
    gentleHints,
    guide,
    layoutEditing,
    resetVersion,
    screen,
    usesFreehandFallback,
  ]);

  const openSection = (section: SutraSection) => {
    moveTo(section.startIndex);
    setMobileSheet(null);
    setScreen("writing");
  };

  const openScripture = (scriptureId: string) => {
    const nextScripture = sutras.find((item) => item.id === scriptureId) ?? diamondSutra;
    const nextProgress = normalizeProgress(progressByScripture[nextScripture.id], nextScripture);
    const nextCharacters = getSutraCharacters(nextScripture);
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setActiveScriptureId(nextScripture.id);
    setFeedback(writingPromptFor(nextCharacters[nextProgress.characterIndex]));
    setMobileSheet(null);
    setScreen("writing");
  };

  const openReader = (scriptureId: string) => {
    const nextScripture = sutras.find((item) => item.id === scriptureId) ?? diamondSutra;
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setActiveScriptureId(nextScripture.id);
    setMobileSheet(null);
    setScreen("reading");
  };

  const demonstrate = () => {
    if (usesFreehandFallback) {
      setFeedback("此異體字暫無筆順校驗，請依淡墨字形書寫");
      return;
    }
    if (!writer.current) return;
    writer.current.cancelQuiz();
    setFeedback("請看一遍運筆順序");
    writer.current.animateCharacter({
      onComplete: () => {
        setFeedback("現在換你來寫");
        setResetVersion((value) => value + 1);
      },
    });
  };

  if (screen === "library") {
    return (
      <main className="library-home">
        <header className="library-topbar">
          <div className="brand-lockup">
            <span className="seal" aria-hidden="true">寫<br />經</span>
            <div><strong>一字一念</strong><span>靜心讀寫</span></div>
          </div>
          <button
            className="library-history"
            type="button"
            onClick={() => {
              openScripture(activeScriptureId);
              setMobileSheet("progress");
            }}
          ><span aria-hidden="true">◷</span> 抄寫記錄</button>
        </header>

        <section className="library-intro">
          <span className="eyebrow">心靜，則字靜</span>
          <h1>選一部經，<br />安靜地讀，<br />慢慢地寫</h1>
          <p>不用趕進度。讀到哪裡、寫到哪裡，都會自動保存在這臺設備上。</p>
        </section>

        <section className="scripture-shelf" aria-label="選擇經文">
          {sutras.map((item) => (
            <LibrarySutraCard
              key={item.id}
              scripture={item}
              progress={progressByScripture[item.id]}
              readingProgress={readingProgressByScripture[item.id]}
              onRead={openReader}
              onWrite={openScripture}
            />
          ))}
          <article className="scripture-card upcoming">
            <div className="mini-cover medicine-cover"><strong>藥師<br />經</strong></div>
            <div><span>即將推出</span><h3>藥師琉璃光如來本願功德經</h3><p>一卷 · 十二大願</p></div>
          </article>
        </section>

        <footer className="library-footer"><span>所有進度僅保存在本機</span><i />無需登錄，也不上傳讀寫內容</footer>
      </main>
    );
  }

  if (screen === "reading") {
    return (
      <ReaderScreen
        key={scripture.id}
        scripture={scripture}
        progress={activeReadingProgress}
        tracks={SUTRA_AUDIO_TRACKS[scripture.id] ?? []}
        onProgressChange={(patch) => updateReadingProgress(scripture.id, patch)}
        onPersist={persistReadingProgress}
        onBack={() => setScreen("library")}
        onWrite={() => openScripture(scripture.id)}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-lockup brand-button" type="button" onClick={() => setScreen("library")} aria-label="返回選經首頁">
          <span className="seal" aria-hidden="true">寫<br />經</span>
          <div><strong>一字一念</strong><span>靜心讀寫</span></div>
        </button>

        <div className="mobile-title">
          <strong>{scripture.shortTitle}</strong>
          <span>{sectionLabel(scripture, currentSection)} · {formatTime(seconds)}</span>
        </div>

        <button className="topbar-action" type="button" onClick={() => setScreen("library")}>完成</button>
      </header>

      <section className="writing-stage" aria-label="抄寫區">
        <div className="paper">
          <div className="paper-heading">
            <div><span>{sectionLabel(scripture, currentSection)}</span><h2>{currentSection.title}</h2></div>
            <span className="page-count">第 {characterIndex + 1} / {totalCharacters} 字</span>
          </div>

          <div className="source-strip" aria-label="經文原文">
            {sourceWindowStart > 0 && <span className="source-more">…</span>}
            {sourceCharacters.map((character, index) => {
              const globalIndex = sourceWindowStart + index;
              return (
                <button
                  type="button"
                  key={`${character}-${globalIndex}`}
                  className={`source-character${globalIndex === characterIndex ? " current" : ""}${completedSet.has(globalIndex) ? " complete" : ""}`}
                  onClick={() => moveTo(globalIndex)}
                  aria-label={`跳到第 ${globalIndex + 1} 字，${character}`}
                >{character}</button>
              );
            })}
            {sourceWindowStart + sourceCharacters.length < totalCharacters && <span className="source-more">…</span>}
          </div>

          <div className="practice-area">
            <button className="round-button previous" type="button" onClick={() => moveTo(characterIndex - 1)} aria-label="上一個字">←</button>

            <div className={`writer-column${layoutEditing ? " layout-editing" : ""}`}>
              <div className="character-meta"><span>當前</span><strong>{currentCharacter}</strong><i aria-hidden="true" /></div>
              {layoutEditing && (
                <div className="layout-edit-toolbar" aria-label="田字格調整工具">
                  <span>拖動格子調整位置</span>
                  <button type="button" onClick={() => setWritingLayout(writingLayoutPreset(writingLayout.handedness))}>重置</button>
                  <button type="button" className="done" onClick={() => setLayoutEditing(false)}>完成</button>
                </div>
              )}
              <div className="grid-workspace" ref={gridWorkspace} style={writingGridStyle}>
                <div className="grid-positioner">
                  <div className="writing-grid">
                    <div className="grid-line horizontal" />
                    <div className="grid-line vertical" />
                    <div className="grid-line diagonal-one" />
                    <div className="grid-line diagonal-two" />
                    {usesFreehandFallback ? (
                      <FreehandWriter
                        character={currentCharacter}
                        guide={guide}
                        resetVersion={resetVersion}
                        onComplete={completeCurrentCharacter}
                      />
                    ) : (
                      <div className="writer-mount" ref={writerMount} aria-label={`請書寫“${currentCharacter}”字`} />
                    )}
                  </div>
                  {layoutEditing && (
                    <div
                      className="grid-edit-overlay"
                      role="group"
                      aria-label="拖動以移動田字格"
                      onPointerDown={(event) => beginLayoutGesture("move", event)}
                      onPointerMove={updateLayoutGesture}
                      onPointerUp={endLayoutGesture}
                      onPointerCancel={endLayoutGesture}
                    >
                      <span className="drag-cue">按住拖動</span>
                      {RESIZE_CORNERS.map(({ corner, label, symbol }) => (
                        <button
                          className={`resize-handle ${corner}`}
                          key={corner}
                          type="button"
                          aria-label={label}
                          onPointerDown={(event) => beginLayoutGesture("resize", event, corner)}
                          onPointerMove={updateLayoutGesture}
                          onPointerUp={endLayoutGesture}
                          onPointerCancel={endLayoutGesture}
                        >{symbol}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="feedback"><span aria-hidden="true">◌</span>{feedback}</p>
            </div>

            <button className="round-button next" type="button" onClick={() => moveTo(characterIndex + 1)} aria-label="下一個字">→</button>
          </div>

          <div className="writing-tools" aria-label="抄寫工具">
            <button type="button" onClick={() => setGuide((value) => !value)} className={guide ? "tool active" : "tool"}>
              <span aria-hidden="true">字</span>{guide ? "淡墨提示 · 開" : "淡墨提示 · 關"}
            </button>
            <button type="button" className="tool" onClick={demonstrate} disabled={usesFreehandFallback}><span aria-hidden="true">▷</span>{usesFreehandFallback ? "自由書寫" : "看筆順"}</button>
            <button type="button" className="tool" onClick={() => setResetVersion((value) => value + 1)}><span aria-hidden="true">↺</span>重寫</button>
          </div>
        </div>
      </section>

      <nav className="mobile-tabbar" aria-label="主要導航">
        <button type="button" onClick={() => setMobileSheet("chapters")}><span aria-hidden="true">冊</span>目錄</button>
        <button type="button" className="active" onClick={() => setMobileSheet(null)}><span aria-hidden="true">寫</span>抄寫</button>
        <button type="button" onClick={() => setMobileSheet("progress")}><span aria-hidden="true">◔</span>進度</button>
        <button type="button" onClick={() => setMobileSheet("settings")}><span aria-hidden="true">調</span>設置</button>
      </nav>

      {mobileSheet && (
        <div className="mobile-sheet-layer" role="presentation" onClick={() => setMobileSheet(null)}>
          <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label="移動端面板" onClick={(event) => event.stopPropagation()}>
            <button className="sheet-handle" type="button" onClick={() => setMobileSheet(null)} aria-label="關閉面板" />
            {mobileSheet === "chapters" && (
              <>
                <div className="sheet-heading"><div><span>{scripture.title}</span><h3>{scripture.sections.length === 1 ? "經文目錄" : "選擇章節"}</h3></div><strong>{scripture.sections.length} {scripture.sectionUnit}</strong></div>
                <div className="mobile-section-list">
                  {scripture.sections.map((section) => {
                    const status = getSectionStatus(section, completedSet, characterIndex);
                    return (
                      <button key={section.id} className={section.id === currentSection.id ? "active" : ""} type="button" onClick={() => openSection(section)}>
                        <span>{String(section.id).padStart(2, "0")}</span><strong>{section.title}</strong><small>{status}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {mobileSheet === "progress" && (
              <>
                <div className="sheet-heading"><div><span>一念一字</span><h3>全經進度</h3></div><strong>{sutraProgress}%</strong></div>
                <div className="mobile-progress-bar"><span style={{ width: `${sutraProgress}%` }} /></div>
                <div className="mobile-stats">
                  <div><span>累計用時</span><strong>{formatTime(seconds)}</strong></div>
                  <div><span>完成章節</span><strong>{completedSectionCount} / {scripture.sections.length}</strong></div>
                  <div><span>完成字數</span><strong>{copiedCount}</strong></div>
                </div>
                <button className="sheet-primary" type="button" onClick={() => setScreen("library")}>完成本次抄寫</button>
              </>
            )}
            {mobileSheet === "settings" && (
              <>
                <div className="sheet-heading"><div><span>書寫體驗</span><h3>抄寫設置</h3></div></div>
                <div className="setting-list">
                  <div className="layout-setting">
                    <span><strong>慣用手</strong><small>田字格會靠近持機手一側</small></span>
                    <div className="handedness-control" role="group" aria-label="選擇慣用手">
                      <button type="button" className={writingLayout.handedness === "left" ? "active" : ""} aria-pressed={writingLayout.handedness === "left"} onClick={() => chooseHandedness("left")}>左手</button>
                      <button type="button" className={writingLayout.handedness === "right" ? "active" : ""} aria-pressed={writingLayout.handedness === "right"} onClick={() => chooseHandedness("right")}>右手</button>
                    </div>
                  </div>
                  <label className="size-setting">
                    <span><strong>田字格大小</strong><small>{Math.round(writingLayout.size)} 像素</small></span>
                    <input
                      type="range"
                      min="220"
                      max="380"
                      step="10"
                      value={writingLayout.size}
                      aria-label="田字格大小"
                      onChange={(event) => setWritingLayout((value) => ({ ...value, size: Number(event.target.value) }))}
                    />
                  </label>
                  <button
                    className="adjust-grid-button"
                    type="button"
                    onClick={() => {
                      setMobileSheet(null);
                      setLayoutEditing(true);
                    }}
                  >
                    <span><strong>調整田字格位置</strong><small>拖動格子，從四角調整大小</small></span><b aria-hidden="true">調整 →</b>
                  </button>
                  <button type="button" onClick={() => setGuide((value) => !value)}>
                    <span><strong>淡墨字形</strong><small>在格中顯示參考字形</small></span><i className={guide ? "toggle on" : "toggle"} />
                  </button>
                  <button type="button" onClick={() => setAutoAdvance((value) => !value)}>
                    <span><strong>自動進入下一字</strong><small>完成後停留一息再繼續</small></span><i className={autoAdvance ? "toggle on" : "toggle"} />
                  </button>
                  <button type="button" onClick={() => setGentleHints((value) => !value)}>
                    <span><strong>溫和筆順提示</strong><small>連續兩次偏離後再提示</small></span><i className={gentleHints ? "toggle on" : "toggle"} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
