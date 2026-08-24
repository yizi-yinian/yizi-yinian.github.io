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
import {
  diamondSutra,
  diamondSutraCharacters,
  getSectionAt,
  getSectionStatus,
  type SutraSection,
} from "@/app/lib/sutra";

const STORAGE_KEY = "yizi-yinian-progress-v1";
const TOTAL_CHARACTERS = diamondSutraCharacters.length;
const FREEHAND_FALLBACK = new Set(hanziWriterCoverage.freehandFallback);

type SavedProgress = {
  scriptureId: "diamond-sutra";
  characterIndex: number;
  completedCount?: number;
  completedIndices?: number[];
  elapsedSeconds: number;
  updatedAt: string;
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

function chapterLabel(section: SutraSection) {
  return `第${formatSectionNumber(section.id)}品`;
}

function writingPromptFor(index: number) {
  return FREEHAND_FALLBACK.has(diamondSutraCharacters[index])
    ? "此異體字暫無筆順校驗，請依淡墨字形書寫"
    : "依照淡墨字形，緩緩落筆";
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

export default function Home() {
  const writerMount = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [resetVersion, setResetVersion] = useState(0);
  const [guide, setGuide] = useState(true);
  const [gentleHints, setGentleHints] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"chapters" | "progress" | "settings" | null>(null);
  const [feedback, setFeedback] = useState("依照淡墨字形，緩緩落筆");
  const [seconds, setSeconds] = useState(0);
  const [screen, setScreen] = useState<"library" | "writing">("library");
  const [storageReady, setStorageReady] = useState(false);

  const currentCharacter = diamondSutraCharacters[characterIndex];
  const usesFreehandFallback = FREEHAND_FALLBACK.has(currentCharacter);
  const currentSection = getSectionAt(characterIndex);
  const completedSet = useMemo(() => new Set(completedIndices), [completedIndices]);
  const copiedCount = completedSet.size;
  const sutraProgress = Math.round((copiedCount / TOTAL_CHARACTERS) * 100);
  const currentSectionCompleted = useMemo(
    () =>
      Array.from(
        { length: currentSection.characterCount },
        (_, index) => currentSection.startIndex + index,
      ).filter((index) => completedSet.has(index)).length,
    [completedSet, currentSection],
  );
  const currentSectionProgress = Math.round(
    (currentSectionCompleted / currentSection.characterCount) * 100,
  );
  const completedSectionCount = useMemo(
    () =>
      diamondSutra.sections.filter((section) => {
        for (let index = section.startIndex; index < section.endIndex; index += 1) {
          if (!completedSet.has(index)) return false;
        }
        return true;
      }).length,
    [completedSet],
  );
  const sourceWindowStart = Math.max(
    0,
    Math.min(characterIndex - 9, TOTAL_CHARACTERS - 22),
  );
  const sourceCharacters = diamondSutraCharacters.slice(
    sourceWindowStart,
    sourceWindowStart + 22,
  );

  const moveTo = useCallback((nextIndex: number) => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const safeIndex = Math.max(0, Math.min(nextIndex, TOTAL_CHARACTERS - 1));
    setCharacterIndex(safeIndex);
    setFeedback(writingPromptFor(safeIndex));
  }, []);

  const completeCurrentCharacter = useCallback(() => {
    setCompletedIndices((value) =>
      value.includes(characterIndex)
        ? value
        : [...value, characterIndex].sort((left, right) => left - right),
    );
    if (characterIndex === TOTAL_CHARACTERS - 1) {
      setFeedback("全經抄寫圓滿，願此刻清淨安穩");
      return;
    }
    if (!autoAdvance) {
      setFeedback("此字已完成，可手動進入下一字");
      return;
    }
    setFeedback("寫得很好，停一息，進入下一字");
    const nextIndex = Math.min(characterIndex + 1, TOTAL_CHARACTERS - 1);
    advanceTimer.current = window.setTimeout(() => {
      setCharacterIndex(nextIndex);
      setFeedback(writingPromptFor(nextIndex));
    }, 850);
  }, [autoAdvance, characterIndex]);

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
        if (saved) {
          const progress = JSON.parse(saved) as SavedProgress;
          if (progress.scriptureId === "diamond-sutra") {
            const restoredIndex = Math.max(
              0,
              Math.min(progress.characterIndex, TOTAL_CHARACTERS - 1),
            );
            setCharacterIndex(restoredIndex);
            setFeedback(writingPromptFor(restoredIndex));
            const restored = Array.isArray(progress.completedIndices)
              ? progress.completedIndices
              : Array.from(
                  {
                    length: Math.max(
                      0,
                      Math.min(progress.completedCount ?? 0, TOTAL_CHARACTERS),
                    ),
                  },
                  (_, index) => index,
                );
            setCompletedIndices(
              Array.from(
                new Set(
                  restored.filter(
                    (index) => Number.isInteger(index) && index >= 0 && index < TOTAL_CHARACTERS,
                  ),
                ),
              ).sort((left, right) => left - right),
            );
            setSeconds(Math.max(0, progress.elapsedSeconds || 0));
          }
        }
      } catch {
        // Private browsing may disable storage; the writing surface still works.
      } finally {
        setStorageReady(true);
      }
    });
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  useEffect(() => {
    if (screen !== "writing") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (!storageReady) return;
    const progress: SavedProgress = {
      scriptureId: "diamond-sutra",
      characterIndex,
      completedCount: copiedCount,
      completedIndices: Array.from(completedSet).sort((left, right) => left - right),
      elapsedSeconds: seconds,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Storage is an enhancement, never a blocker for the writing surface.
    }
  }, [characterIndex, completedSet, copiedCount, seconds, storageReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") moveTo(characterIndex - 1);
      if (event.key === "ArrowRight") moveTo(characterIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [characterIndex, moveTo]);

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
    resetVersion,
    screen,
    usesFreehandFallback,
  ]);

  const openSection = (section: SutraSection) => {
    moveTo(section.startIndex);
    setMobileSheet(null);
    setScreen("writing");
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
            <div><strong>一字一念</strong><span>靜心抄經</span></div>
          </div>
          <button
            className="library-history"
            type="button"
            onClick={() => {
              setScreen("writing");
              setMobileSheet("progress");
            }}
          ><span aria-hidden="true">◷</span> 抄寫記錄</button>
        </header>

        <section className="library-intro">
          <span className="eyebrow">心靜，則字靜</span>
          <h1>選一部經，<br />安靜地寫一會兒</h1>
          <p>不用趕進度。每一次落筆，都會自動保存在這臺設備上。</p>
        </section>

        <section className="scripture-shelf" aria-label="選擇經文">
          <article className="scripture-card featured">
            <div className="book-cover diamond-cover">
              <span>{diamondSutra.translator}</span>
              <strong>金剛般若<br />波羅蜜經</strong>
              <i>般若</i>
            </div>
            <div className="book-info">
              <div className="book-meta"><span>三十二品</span><span>正文 5,129 字</span><span>繁體</span></div>
              <h2>{diamondSutra.title}</h2>
              <p>從“如是我聞”開始，一字一念。建議每次抄寫 10–20 分鐘。</p>
              {copiedCount > 0 ? (
                <div className="continue-progress">
                  <div>
                    <span>上次抄至</span>
                    <strong>{chapterLabel(currentSection)} · 第 {characterIndex - currentSection.startIndex + 1} 字</strong>
                  </div>
                  <span>{sutraProgress}%</span>
                  <div className="continue-track"><i style={{ width: `${Math.max(sutraProgress, 1)}%` }} /></div>
                </div>
              ) : (
                <div className="new-book-note">尚未開始 · 從第一品起抄</div>
              )}
              <button className="start-writing" type="button" onClick={() => setScreen("writing")}>
                {copiedCount > 0 ? "繼續抄寫" : "開始抄寫"}<span>→</span>
              </button>
              <a
                className="source-credit"
                href="https://cbetaonline.dila.edu.tw/zh/T0235_001"
                target="_blank"
                rel="noreferrer"
              >經文依據 CBETA T08 No. 235 校對 ↗</a>
            </div>
          </article>

          <article className="scripture-card upcoming">
            <div className="mini-cover heart-cover"><strong>般若<br />心經</strong></div>
            <div><span>即將推出</span><h3>般若波羅蜜多心經</h3><p>一卷 · 二百六十字</p></div>
          </article>
          <article className="scripture-card upcoming">
            <div className="mini-cover medicine-cover"><strong>藥師<br />經</strong></div>
            <div><span>即將推出</span><h3>藥師琉璃光如來本願功德經</h3><p>一卷 · 十二大願</p></div>
          </article>
        </section>

        <footer className="library-footer"><span>所有進度僅保存在本機</span><i />無需登錄，也不上傳抄寫內容</footer>
      </main>
    );
  }

  return (
    <main className={focusMode ? "app-shell focus-mode" : "app-shell"}>
      <header className="topbar">
        <button className="brand-lockup brand-button" type="button" onClick={() => setScreen("library")} aria-label="返回選經首頁">
          <span className="seal" aria-hidden="true">寫<br />經</span>
          <div><strong>一字一念</strong><span>靜心抄經</span></div>
        </button>

        <div className="mobile-title">
          <strong>金剛經</strong>
          <span>{chapterLabel(currentSection)} · {formatTime(seconds)}</span>
        </div>

        <div className="session-pill" aria-label={`累計抄寫 ${formatTime(seconds)}`}>
          <span className="breath-dot" aria-hidden="true" />
          <span>累計抄寫</span>
          <strong>{formatTime(seconds)}</strong>
        </div>

        <button className="focus-button" type="button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>
          <span aria-hidden="true">◐</span>{focusMode ? "退出靜心" : "靜心模式"}
        </button>
      </header>

      <aside className="left-panel" aria-label="經文章節">
        <div className="sutra-heading">
          <span className="eyebrow">{diamondSutra.translator}</span>
          <h1>金剛般若<br />波羅蜜經</h1>
          <div className="title-rule" />
          <p>全經三十二品 · 正文 5,129 字</p>
        </div>

        <nav className="section-list" aria-label="章節">
          {diamondSutra.sections.map((section) => {
            const active = section.id === currentSection.id;
            const status = getSectionStatus(section, completedSet, characterIndex);
            return (
              <button
                className={`section${active ? " active" : ""}${status === "已完成" ? " done" : ""}`}
                key={section.id}
                type="button"
                onClick={() => openSection(section)}
              >
                <span className="section-number">{String(section.id).padStart(2, "0")}</span>
                <span><strong>{section.title}</strong><small>{status}</small></span>
                {active && <span className="section-mark" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        <div className="daily-verse">
          <span>今日一偈</span>
          <p>應無所住，<br />而生其心。</p>
        </div>
      </aside>

      <section className="writing-stage" aria-label="抄寫區">
        <div className="paper">
          <div className="paper-heading">
            <div><span>{chapterLabel(currentSection)}</span><h2>{currentSection.title}</h2></div>
            <span className="page-count">第 {characterIndex + 1} / {TOTAL_CHARACTERS} 字</span>
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
            {sourceWindowStart + sourceCharacters.length < TOTAL_CHARACTERS && <span className="source-more">…</span>}
          </div>

          <div className="practice-area">
            <button className="round-button previous" type="button" onClick={() => moveTo(characterIndex - 1)} aria-label="上一個字">←</button>

            <div className="writer-column">
              <div className="character-meta"><span>當前</span><strong>{currentCharacter}</strong><i aria-hidden="true" /></div>
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
        <p className="keyboard-note">可用左右方向鍵切換字 · 書寫完成後自動保存</p>
      </section>

      <aside className="right-panel" aria-label="抄寫進度">
        <section className="progress-card">
          <div className="card-title"><span>全經進度</span><span>{completedSectionCount} / 32 品</span></div>
          <div className="progress-ring" style={{ "--progress": `${sutraProgress}%` } as CSSProperties}>
            <div><strong>{sutraProgress}%</strong><span>{copiedCount} / {TOTAL_CHARACTERS} 字</span></div>
          </div>
          <p>累計靜心抄寫 <strong>{formatTime(seconds)}</strong></p>
          <div className="progress-track"><span style={{ width: `${sutraProgress}%` }} /></div>
          <small>{chapterLabel(currentSection)}已完成 {currentSectionProgress}%</small>
        </section>

        <section className="guidance-card">
          <span className="eyebrow">書寫提示</span>
          <h3>慢一點，也很好</h3>
          <p>抄經不求快。每寫完一個字，停一息，再落下一筆。</p>
          <div className="breathing-line"><span /><span /><span /></div>
        </section>

        <section className="session-card">
          <div><span>當前章節</span><strong>{currentSection.id} / 32 品</strong></div>
          <div><span>本品完成</span><strong>{currentSectionCompleted} / {currentSection.characterCount}</strong></div>
        </section>

        <button className="finish-button" type="button" onClick={() => setScreen("library")}>完成本次抄寫</button>
      </aside>

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
                <div className="sheet-heading"><div><span>金剛般若波羅蜜經</span><h3>選擇章節</h3></div><strong>32 品</strong></div>
                <div className="mobile-section-list">
                  {diamondSutra.sections.map((section) => {
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
                  <div><span>完成章節</span><strong>{completedSectionCount} / 32</strong></div>
                  <div><span>完成字數</span><strong>{copiedCount}</strong></div>
                </div>
                <button className="sheet-primary" type="button" onClick={() => setScreen("library")}>完成本次抄寫</button>
              </>
            )}
            {mobileSheet === "settings" && (
              <>
                <div className="sheet-heading"><div><span>書寫體驗</span><h3>抄寫設置</h3></div></div>
                <div className="setting-list">
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
