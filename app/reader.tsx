"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Sutra } from "@/app/lib/sutra";
import type {
  SavedReadingProgress,
  SutraAudioTrack,
} from "@/app/lib/reading";

type ReaderScreenProps = {
  scripture: Sutra;
  progress: SavedReadingProgress;
  tracks: SutraAudioTrack[];
  onProgressChange: (patch: Partial<SavedReadingProgress>) => void;
  onPersist: () => void;
  onBack: () => void;
  onWrite: () => void;
};

const READER_TOP_INSET = 78;

function paragraphAnchor(sectionId: number, paragraphIndex: number) {
  return `reader-${sectionId}-${paragraphIndex}`;
}

export default function ReaderScreen({
  scripture,
  progress,
  tracks,
  onProgressChange,
  onPersist,
  onBack,
  onWrite,
}: ReaderScreenProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const restoredTrack = useRef("");
  const lastAudioSave = useRef(0);
  const initialProgress = useRef(progress);
  const latestProgress = useRef(progress);
  const updateProgress = useRef(onProgressChange);
  const persistProgress = useRef(onPersist);
  const [activeTrackId, setActiveTrackId] = useState(() => {
    const restored = tracks.find((track) => track.id === progress.activeTrackId);
    return restored?.id ?? tracks[0]?.id ?? "";
  });

  useEffect(() => {
    latestProgress.current = progress;
  }, [progress]);

  useEffect(() => {
    updateProgress.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    persistProgress.current = onPersist;
  }, [onPersist]);

  const activeTrack = useMemo(
    () => tracks.find((track) => track.id === activeTrackId) ?? tracks[0],
    [activeTrackId, tracks],
  );

  const captureReadingPosition = useCallback(() => {
    const anchors = contentRef.current?.querySelectorAll<HTMLElement>("[data-reading-anchor]");
    if (!anchors?.length) return;

    let activeAnchor = anchors[0];
    if (activeAnchor.getBoundingClientRect().top > READER_TOP_INSET) {
      updateProgress.current({ anchorId: "", anchorOffset: 0 });
      return;
    }
    for (const anchor of anchors) {
      if (anchor.getBoundingClientRect().top <= READER_TOP_INSET) activeAnchor = anchor;
      else break;
    }

    updateProgress.current({
      anchorId: activeAnchor.dataset.readingAnchor ?? "",
      anchorOffset: Math.max(0, READER_TOP_INSET - activeAnchor.getBoundingClientRect().top),
    });
  }, []);

  const saveAudioPosition = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack || !Number.isFinite(audio.currentTime)) return;
    updateProgress.current({
      activeTrackId: activeTrack.id,
      audioTimes: {
        ...latestProgress.current.audioTimes,
        [activeTrack.id]: Math.max(0, audio.currentTime),
      },
    });
    lastAudioSave.current = audio.currentTime;
  }, [activeTrack]);

  const saveSession = useCallback(() => {
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    captureReadingPosition();
    saveAudioPosition();
    persistProgress.current();
  }, [captureReadingPosition, saveAudioPosition]);

  useEffect(() => {
    let positionFrame: number | undefined;
    const restoreFrame = window.requestAnimationFrame(() => {
      positionFrame = window.requestAnimationFrame(() => {
        const restored = initialProgress.current;
        const restoredAnchor = restored.anchorId
          ? document.getElementById(restored.anchorId)
          : null;
        if (!restoredAnchor) {
          window.scrollTo({ top: 0 });
          return;
        }
        const top = restoredAnchor.getBoundingClientRect().top
          + window.scrollY
          - READER_TOP_INSET
          + restored.anchorOffset;
        window.scrollTo({ top: Math.max(0, top) });
      });
    });

    const handleScroll = () => {
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(captureReadingPosition, 180);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (positionFrame) window.cancelAnimationFrame(positionFrame);
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    };
  }, [captureReadingPosition, scripture.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveSession();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", saveSession);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", saveSession);
    };
  }, [saveSession]);

  const restoreAudioPosition = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack || restoredTrack.current === activeTrack.id) return;
    const savedTime = latestProgress.current.audioTimes[activeTrack.id] ?? 0;
    const maximum = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : savedTime;
    audio.currentTime = Math.min(savedTime, maximum);
    lastAudioSave.current = audio.currentTime;
    restoredTrack.current = activeTrack.id;
  };

  const handleTrackChange = (trackId: string) => {
    saveAudioPosition();
    restoredTrack.current = "";
    setActiveTrackId(trackId);
    updateProgress.current({ activeTrackId: trackId });
  };

  const handleAudioTimeUpdate = () => {
    const currentTime = audioRef.current?.currentTime ?? 0;
    if (Math.abs(currentTime - lastAudioSave.current) >= 5) saveAudioPosition();
  };

  const leaveReader = (next: () => void) => {
    saveSession();
    next();
  };

  const scrollToSection = (sectionId: number) => {
    const anchor = document.getElementById(paragraphAnchor(sectionId, 0));
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top + window.scrollY - READER_TOP_INSET + 1;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  return (
    <main className="reader-shell">
      <header className="topbar reader-topbar">
        <button
          className="reader-back"
          type="button"
          onClick={() => leaveReader(onBack)}
          aria-label="返回選經首頁"
        >←</button>
        <div className="mobile-title">
          <strong>{scripture.shortTitle}</strong>
          <span>讀經</span>
        </div>
        <button className="topbar-action" type="button" onClick={() => leaveReader(onWrite)}>
          抄寫
        </button>
      </header>

      <div className="reader-stage" ref={contentRef}>
        <header className="reader-heading">
          <span>{scripture.translator}</span>
          <h1>{scripture.title}</h1>
          <p>全經 {scripture.sections.length} {scripture.sectionUnit} · 正文 {scripture.characterCount.toLocaleString("zh-Hant")} 字</p>
        </header>

        {scripture.sections.length > 1 && (
          <nav className="reader-section-nav" aria-label="經文章節">
            {scripture.sections.map((section) => (
              <button key={section.id} type="button" onClick={() => scrollToSection(section.id)}>
                {String(section.id).padStart(2, "0")}
              </button>
            ))}
          </nav>
        )}

        <article className="reader-text">
          {scripture.sections.map((section) => {
            const paragraphs = section.text.split(/\n+/u).filter(Boolean);
            return (
              <section className="reader-section" key={section.id}>
                <header>
                  <span>{scripture.sections.length === 1 ? `全${scripture.sectionUnit}` : `第${section.id}${scripture.sectionUnit}`}</span>
                  <h2>{section.title}</h2>
                </header>
                {paragraphs.map((paragraph, paragraphIndex) => {
                  const anchorId = paragraphAnchor(section.id, paragraphIndex);
                  return (
                    <p id={anchorId} data-reading-anchor={anchorId} key={anchorId}>
                      {paragraph}
                    </p>
                  );
                })}
              </section>
            );
          })}
        </article>

        <a className="reader-source" href={scripture.source.url} target="_blank" rel="noreferrer">
          經文依據 {scripture.source.label.replace("CBETA《大正新脩大藏經》", "CBETA ")} 校對 ↗
        </a>
      </div>

      <section className={`reader-player${activeTrack ? "" : " empty"}`} aria-label="讀經音頻">
        {activeTrack ? (
          <>
            <div className="reader-player-heading">
              <div><span>正在播放</span><strong>{activeTrack.title}</strong></div>
              {tracks.length > 1 && (
                <select
                  aria-label="選擇讀經音頻"
                  value={activeTrack.id}
                  onChange={(event) => handleTrackChange(event.target.value)}
                >
                  {tracks.map((track) => <option value={track.id} key={track.id}>{track.title}</option>)}
                </select>
              )}
            </div>
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={activeTrack.src}
              onLoadedMetadata={restoreAudioPosition}
              onPause={saveAudioPosition}
              onEnded={saveAudioPosition}
              onTimeUpdate={handleAudioTimeUpdate}
            />
          </>
        ) : (
          <>
            <span className="reader-player-icon" aria-hidden="true">聽</span>
            <div><strong>音頻稍後加入</strong><span>經文仍可自由閱讀，位置會自動保存</span></div>
          </>
        )}
      </section>
    </main>
  );
}
