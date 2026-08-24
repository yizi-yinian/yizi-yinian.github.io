import diamondSutraData from "@/app/data/diamond-sutra.json";
import heartSutraData from "@/app/data/heart-sutra.json";

export type SutraSection = {
  id: number;
  title: string;
  text: string;
  startIndex: number;
  endIndex: number;
  characterCount: number;
};

export type Sutra = {
  id: string;
  title: string;
  shortTitle: string;
  translator: string;
  script: string;
  sectionUnit: string;
  source: {
    label: string;
    url: string;
    xmlUrl: string;
    xmlRevision: string;
    xmlSha256: string;
    normalizedHanSha256: string;
  };
  characterCount: number;
  sections: SutraSection[];
};

export const diamondSutra = diamondSutraData satisfies Sutra;
export const heartSutra = heartSutraData satisfies Sutra;
export const sutras = [diamondSutra, heartSutra] satisfies Sutra[];

export function getSutraCharacters(sutra: Sutra) {
  return sutra.sections.flatMap((section) =>
    Array.from(section.text).filter((character) => /[\u3400-\u9fff]/u.test(character)),
  );
}

export const diamondSutraCharacters = getSutraCharacters(diamondSutra);
export const heartSutraCharacters = getSutraCharacters(heartSutra);

export function getSectionAt(sutra: Sutra, index: number) {
  return (
    sutra.sections.find(
      (section) => index >= section.startIndex && index < section.endIndex,
    ) ?? sutra.sections.at(-1)!
  );
}

export function getSectionLabel(sutra: Sutra, section: SutraSection) {
  if (sutra.sections.length === 1) return `全${sutra.sectionUnit}`;
  return `第${section.id}${sutra.sectionUnit}`;
}

export function getCompletedSectionCount(
  sutra: Sutra,
  completedIndices: ReadonlySet<number>,
) {
  return sutra.sections.filter((section) => {
    for (let index = section.startIndex; index < section.endIndex; index += 1) {
      if (!completedIndices.has(index)) return false;
    }
    return true;
  }).length;
}

/* Retained as named exports for scripts and tests that inspect individual texts. */
export const allSutraCharacters = sutras.flatMap((sutra) =>
  getSutraCharacters(sutra),
);

export function getSectionStatus(
  section: SutraSection,
  completedIndices: ReadonlySet<number>,
  characterIndex: number,
) {
  let completedInSection = 0;
  for (let index = section.startIndex; index < section.endIndex; index += 1) {
    if (completedIndices.has(index)) completedInSection += 1;
  }
  if (completedInSection === section.characterCount) return "已完成";
  if (
    characterIndex >= section.startIndex &&
    characterIndex < section.endIndex
  ) return completedInSection > 0 ? "正在抄寫" : "當前章節";
  if (completedInSection > 0) return "已有進度";
  return "未開始";
}
