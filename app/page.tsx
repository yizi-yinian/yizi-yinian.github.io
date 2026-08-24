"use client";

import HanziWriter from "hanzi-writer";
import { useEffect, useMemo, useRef, useState } from "react";

const passage =
  "如是我闻：一时，佛在舍卫国祇树给孤独园，与大比丘众千二百五十人俱。尔时，世尊食时，著衣持钵，入舍卫大城乞食。于其城中，次第乞已，还至本处。饭食讫，收衣钵，洗足已，敷座而坐。";

const sections = [
  ["01", "法会因由分", "正在抄写"],
  ["02", "善现启请分", "未开始"],
  ["03", "大乘正宗分", "未开始"],
  ["04", "妙行无住分", "未开始"],
  ["05", "如理实见分", "未开始"],
];

const STORAGE_KEY = "yizi-yinian-progress-v1";

type SavedProgress = {
  scriptureId: "diamond-sutra";
  characterIndex: number;
  completedCount: number;
  elapsedSeconds: number;
  updatedAt: string;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function Home() {
  const characters = useMemo(
    () => Array.from(passage).filter((character) => /[\u3400-\u9fff]/.test(character)),
    [],
  );
  const writerMount = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [characterIndex, setCharacterIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [guide, setGuide] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"chapters" | "progress" | "settings" | null>(null);
  const [feedback, setFeedback] = useState("依照淡墨字形，缓缓落笔");
  const [seconds, setSeconds] = useState(0);
  const [screen, setScreen] = useState<"library" | "writing">("library");
  const [storageReady, setStorageReady] = useState(false);

  const currentCharacter = characters[characterIndex];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const progress = JSON.parse(saved) as SavedProgress;
        if (progress.scriptureId === "diamond-sutra") {
          setCharacterIndex(Math.max(0, Math.min(progress.characterIndex, characters.length - 1)));
          setCompletedCount(Math.max(0, Math.min(progress.completedCount || 0, characters.length)));
          setSeconds(Math.max(0, progress.elapsedSeconds || 0));
        }
      }
    } catch {
      // A private browser may disable storage; writing remains fully usable.
    } finally {
      setStorageReady(true);
    }
  }, [characters.length]);

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
      completedCount,
      elapsedSeconds: seconds,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Storage is an enhancement, never a blocker for the writing surface.
    }
  }, [characterIndex, completedCount, seconds, storageReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setCharacterIndex((value) => Math.max(0, value - 1));
        setFeedback("依照淡墨字形，缓缓落笔");
      }
      if (event.key === "ArrowRight") {
        setCharacterIndex((value) => Math.min(characters.length - 1, value + 1));
        setFeedback("依照淡墨字形，缓缓落笔");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [characters.length]);

  useEffect(() => {
    const mount = writerMount.current;
    if (!mount || !currentCharacter) return;

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
        const dataUrl = new URL(`hanzi-data/${encodeURIComponent(character)}.json`, window.location.href);
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`Character data unavailable: ${character}`);
        return response.json();
      },
    });

    writer.current = instance;
    instance.quiz({
      showHintAfterMisses: 2,
      highlightOnComplete: false,
      leniency: 1.25,
      onMistake: (data) => {
        setFeedback(
          data.totalMistakes > 1
            ? "不急，看看淡墨提示，再试这一笔"
            : "这一笔可以再靠近字形一些",
        );
      },
      onCorrectStroke: (data) => {
        setFeedback(`很好，已完成 ${data.strokesRemaining === 0 ? "最后一" : "这一"}笔`);
      },
      onComplete: () => {
        setFeedback("写得很好，稍作停顿，进入下一字");
        setCompletedCount((value) => Math.max(value, characterIndex + 1));
        window.setTimeout(() => {
          setCharacterIndex((value) => Math.min(value + 1, characters.length - 1));
          setFeedback("依照淡墨字形，缓缓落笔");
        }, 850);
      },
    });

    return () => {
      instance.cancelQuiz();
      mount.innerHTML = "";
    };
  }, [characterIndex, characters.length, currentCharacter, guide, resetVersion, screen]);

  const moveTo = (nextIndex: number) => {
    setCharacterIndex(Math.max(0, Math.min(nextIndex, characters.length - 1)));
    setFeedback("依照淡墨字形，缓缓落笔");
  };

  const demonstrate = () => {
    if (!writer.current) return;
    writer.current.cancelQuiz();
    setFeedback("请看一遍运笔顺序");
    writer.current.animateCharacter({
      onComplete: () => {
        setFeedback("现在换你来写");
        writer.current?.quiz({
          showHintAfterMisses: 2,
          highlightOnComplete: false,
          leniency: 1.25,
        });
      },
    });
  };

  const copiedCount = completedCount;
  const passageProgress = Math.round((copiedCount / characters.length) * 100);

  if (screen === "library") {
    return (
      <main className="library-home">
        <header className="library-topbar">
          <div className="brand-lockup">
            <span className="seal" aria-hidden="true">写<br />经</span>
            <div><strong>一字一念</strong><span>静心抄经</span></div>
          </div>
          <button className="library-history" type="button"><span aria-hidden="true">◷</span> 抄写记录</button>
        </header>

        <section className="library-intro">
          <span className="eyebrow">心静，则字静</span>
          <h1>选一部经，<br />安静地写一会儿</h1>
          <p>不用赶进度。每一次落笔，都会自动保存在这台设备上。</p>
        </section>

        <section className="scripture-shelf" aria-label="选择经文">
          <article className="scripture-card featured">
            <div className="book-cover diamond-cover">
              <span>姚秦 · 鸠摩罗什 译</span>
              <strong>金刚般若<br />波罗蜜经</strong>
              <i>般若</i>
            </div>
            <div className="book-info">
              <div className="book-meta"><span>三十二品</span><span>约五千余字</span></div>
              <h2>金刚般若波罗蜜经</h2>
              <p>从“如是我闻”开始，一字一念。建议每次抄写 10–20 分钟。</p>
              {copiedCount > 0 ? (
                <div className="continue-progress">
                  <div><span>上次抄至</span><strong>第一品 · 第 {copiedCount + 1} 字</strong></div>
                  <span>{passageProgress}%</span>
                  <div className="continue-track"><i style={{ width: `${Math.max(passageProgress, 2)}%` }} /></div>
                </div>
              ) : (
                <div className="new-book-note">尚未开始 · 从第一品起抄</div>
              )}
              <button className="start-writing" type="button" onClick={() => setScreen("writing")}>
                {copiedCount > 0 ? "继续抄写" : "开始抄写"}<span>→</span>
              </button>
            </div>
          </article>

          <article className="scripture-card upcoming" aria-disabled="true">
            <div className="mini-cover heart-cover"><strong>般若<br />心经</strong></div>
            <div><span>即将推出</span><h3>般若波罗蜜多心经</h3><p>一卷 · 二百六十字</p></div>
          </article>
          <article className="scripture-card upcoming" aria-disabled="true">
            <div className="mini-cover medicine-cover"><strong>药师<br />经</strong></div>
            <div><span>即将推出</span><h3>药师琉璃光如来本愿功德经</h3><p>一卷 · 十二大愿</p></div>
          </article>
        </section>

        <footer className="library-footer"><span>所有进度仅保存在本机</span><i />无需登录，也不上传抄写内容</footer>
      </main>
    );
  }

  return (
    <main className={focusMode ? "app-shell focus-mode" : "app-shell"}>
      <header className="topbar">
        <button className="brand-lockup brand-button" type="button" onClick={() => setScreen("library")} aria-label="返回选经首页">
          <span className="seal" aria-hidden="true">写<br />经</span>
          <div>
            <strong>一字一念</strong>
            <span>静心抄经</span>
          </div>
        </button>

        <div className="mobile-title">
          <strong>金刚经</strong>
          <span>第一品 · {formatTime(seconds)}</span>
        </div>

        <div className="session-pill" aria-label={`本次已抄写 ${formatTime(seconds)}`}>
          <span className="breath-dot" aria-hidden="true" />
          <span>本次抄写</span>
          <strong>{formatTime(seconds)}</strong>
        </div>

        <button
          className="focus-button"
          type="button"
          aria-pressed={focusMode}
          onClick={() => setFocusMode((value) => !value)}
        >
          <span aria-hidden="true">◐</span>
          {focusMode ? "退出静心" : "静心模式"}
        </button>
      </header>

      <aside className="left-panel" aria-label="经文章节">
        <div className="sutra-heading">
          <span className="eyebrow">姚秦 · 鸠摩罗什 译</span>
          <h1>金刚般若<br />波罗蜜经</h1>
          <div className="title-rule" />
          <p>全经三十二品</p>
        </div>

        <nav className="section-list" aria-label="章节">
          {sections.map(([number, title, status], index) => (
            <button className={index === 0 ? "section active" : "section"} key={number} type="button">
              <span className="section-number">{number}</span>
              <span>
                <strong>{title}</strong>
                <small>{status}</small>
              </span>
              {index === 0 && <span className="section-mark" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <button className="all-sections" type="button">查看全部三十二品 <span>→</span></button>

        <div className="daily-verse">
          <span>今日一偈</span>
          <p>应无所住，<br />而生其心。</p>
        </div>
      </aside>

      <section className="writing-stage" aria-label="抄写区">
        <div className="paper">
          <div className="paper-heading">
            <div>
              <span>第一品</span>
              <h2>法会因由分</h2>
            </div>
            <span className="page-count">第 {characterIndex + 1} / {characters.length} 字</span>
          </div>

          <div className="source-strip" aria-label="经文原文">
            {characters.slice(0, 22).map((character, index) => (
              <button
                type="button"
                key={`${character}-${index}`}
                className={index === characterIndex ? "source-character current" : index < characterIndex ? "source-character complete" : "source-character"}
                onClick={() => moveTo(index)}
                aria-label={`跳到第 ${index + 1} 字，${character}`}
              >
                {character}
              </button>
            ))}
            <span className="source-more">…</span>
          </div>

          <div className="practice-area">
            <button className="round-button previous" type="button" onClick={() => moveTo(characterIndex - 1)} aria-label="上一个字">←</button>

            <div className="writer-column">
              <div className="character-meta">
                <span>当前</span>
                <strong>{currentCharacter}</strong>
                <i aria-hidden="true" />
              </div>

              <div className="writing-grid">
                <div className="grid-line horizontal" />
                <div className="grid-line vertical" />
                <div className="grid-line diagonal-one" />
                <div className="grid-line diagonal-two" />
                <div className="writer-mount" ref={writerMount} aria-label={`请书写“${currentCharacter}”字`} />
              </div>

              <p className="feedback"><span aria-hidden="true">◌</span>{feedback}</p>
            </div>

            <button className="round-button next" type="button" onClick={() => moveTo(characterIndex + 1)} aria-label="下一个字">→</button>
          </div>

          <div className="writing-tools" aria-label="抄写工具">
            <button type="button" onClick={() => setGuide((value) => !value)} className={guide ? "tool active" : "tool"}>
              <span aria-hidden="true">字</span>
              {guide ? "淡墨提示 · 开" : "淡墨提示 · 关"}
            </button>
            <button type="button" className="tool" onClick={demonstrate}>
              <span aria-hidden="true">▷</span>
              看笔顺
            </button>
            <button type="button" className="tool" onClick={() => setResetVersion((value) => value + 1)}>
              <span aria-hidden="true">↺</span>
              重写
            </button>
          </div>
        </div>

        <p className="keyboard-note">可用左右方向键切换字 · 书写完成后自动进入下一字</p>
      </section>

      <aside className="right-panel" aria-label="抄写进度">
        <section className="progress-card">
          <div className="card-title">
            <span>今日抄写</span>
            <button type="button" aria-label="更多设置">•••</button>
          </div>
          <div className="progress-ring" style={{ "--progress": `${passageProgress}%` } as React.CSSProperties}>
            <div>
              <strong>{copiedCount}</strong>
              <span>/ {characters.length} 字</span>
            </div>
          </div>
          <p>已静心抄写 <strong>{formatTime(seconds)}</strong></p>
          <div className="progress-track"><span style={{ width: `${passageProgress}%` }} /></div>
          <small>{copiedCount === 0 ? "从第一字开始" : `本段还差 ${characters.length - copiedCount} 字`}</small>
        </section>

        <section className="guidance-card">
          <span className="eyebrow">书写提示</span>
          <h3>慢一点，也很好</h3>
          <p>抄经不求快。每写完一个字，停一息，再落下一笔。</p>
          <div className="breathing-line"><span /><span /><span /></div>
        </section>

        <section className="session-card">
          <div><span>连续抄写</span><strong>7 天</strong></div>
          <div><span>累计完成</span><strong>1,286 字</strong></div>
        </section>

        <button className="finish-button" type="button" onClick={() => setScreen("library")}>完成本次抄写</button>
      </aside>

      <nav className="mobile-tabbar" aria-label="主要导航">
        <button type="button" onClick={() => setScreen("library")}>
          <span aria-hidden="true">册</span>目录
        </button>
        <button type="button" className="active" onClick={() => setMobileSheet(null)}>
          <span aria-hidden="true">写</span>抄写
        </button>
        <button type="button" onClick={() => setMobileSheet("progress")}>
          <span aria-hidden="true">◔</span>进度
        </button>
        <button type="button" onClick={() => setMobileSheet("settings")}>
          <span aria-hidden="true">调</span>设置
        </button>
      </nav>

      {mobileSheet && (
        <div className="mobile-sheet-layer" role="presentation" onClick={() => setMobileSheet(null)}>
          <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label="移动端面板" onClick={(event) => event.stopPropagation()}>
            <button className="sheet-handle" type="button" onClick={() => setMobileSheet(null)} aria-label="关闭面板" />
            {mobileSheet === "chapters" && (
              <>
                <div className="sheet-heading"><div><span>金刚般若波罗蜜经</span><h3>选择章节</h3></div><strong>32 品</strong></div>
                <div className="mobile-section-list">
                  {sections.map(([number, title, status], index) => (
                    <button key={number} className={index === 0 ? "active" : ""} type="button" onClick={() => setMobileSheet(null)}>
                      <span>{number}</span><strong>{title}</strong><small>{status}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {mobileSheet === "progress" && (
              <>
                <div className="sheet-heading"><div><span>一念一字</span><h3>今日抄写</h3></div><strong>{copiedCount} / {characters.length}</strong></div>
                <div className="mobile-progress-bar"><span style={{ width: `${passageProgress}%` }} /></div>
                <div className="mobile-stats">
                  <div><span>本次时长</span><strong>{formatTime(seconds)}</strong></div>
                  <div><span>连续抄写</span><strong>7 天</strong></div>
                  <div><span>累计完成</span><strong>1,286 字</strong></div>
                </div>
                <button className="sheet-primary" type="button" onClick={() => setScreen("library")}>完成本次抄写</button>
              </>
            )}
            {mobileSheet === "settings" && (
              <>
                <div className="sheet-heading"><div><span>书写体验</span><h3>抄写设置</h3></div></div>
                <div className="setting-list">
                  <button type="button" onClick={() => setGuide((value) => !value)}>
                    <span><strong>淡墨字形</strong><small>在格中显示参考字形</small></span><i className={guide ? "toggle on" : "toggle"} />
                  </button>
                  <button type="button">
                    <span><strong>自动进入下一字</strong><small>完成后停留一息再继续</small></span><i className="toggle on" />
                  </button>
                  <button type="button">
                    <span><strong>温和笔顺提示</strong><small>连续两次偏离后再提示</small></span><i className="toggle on" />
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
