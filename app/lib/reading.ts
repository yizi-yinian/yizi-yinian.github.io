export type SutraAudioTrack = {
  id: string;
  title: string;
  reader?: string;
  src: string;
  sourceUrl?: string;
};

export type SavedReadingProgress = {
  scriptureId: string;
  anchorId: string;
  anchorOffset: number;
  activeTrackId?: string;
  audioTimes: Record<string, number>;
  updatedAt: string;
};

export type SavedReadingLibrary = {
  version: 1;
  progresses: Record<string, SavedReadingProgress>;
};

/* Audio supplied or licensed by the project is registered by scripture id. */
export const SUTRA_AUDIO_TRACKS: Record<string, SutraAudioTrack[]> = {
  "diamond-sutra": [
    {
      id: "diamond-sutra-wang-fei",
      title: "王菲讀誦",
      reader: "王菲",
      src: "/audio/diamond-sutra-wang-fei.m4a",
    },
  ],
  "heart-sutra": [
    {
      id: "heart-sutra-huiping",
      title: "慧平法師讀誦",
      reader: "慧平法師",
      src: "/audio/heart-sutra-huiping.m4a",
      sourceUrl: "https://wz.yyxcfg.com/a/a/4/511.m4a",
    },
  ],
};

export function emptyReadingProgress(scriptureId: string): SavedReadingProgress {
  return {
    scriptureId,
    anchorId: "",
    anchorOffset: 0,
    audioTimes: {},
    updatedAt: "",
  };
}

export function normalizeReadingProgress(
  progress: Partial<SavedReadingProgress> | undefined,
  scriptureId: string,
): SavedReadingProgress {
  const audioTimes = Object.fromEntries(
    Object.entries(progress?.audioTimes ?? {}).filter(
      ([trackId, seconds]) =>
        trackId.length > 0
        && typeof seconds === "number"
        && Number.isFinite(seconds)
        && seconds >= 0,
    ),
  );

  return {
    scriptureId,
    anchorId: typeof progress?.anchorId === "string" ? progress.anchorId : "",
    anchorOffset:
      typeof progress?.anchorOffset === "number" && Number.isFinite(progress.anchorOffset)
        ? Math.max(0, progress.anchorOffset)
        : 0,
    activeTrackId:
      typeof progress?.activeTrackId === "string" ? progress.activeTrackId : undefined,
    audioTimes,
    updatedAt: typeof progress?.updatedAt === "string" ? progress.updatedAt : "",
  };
}
