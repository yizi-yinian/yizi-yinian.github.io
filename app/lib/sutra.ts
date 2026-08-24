import diamondSutraData from "@/app/data/diamond-sutra.json";

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
  characterCount: number;
  sections: SutraSection[];
};

export const diamondSutra = diamondSutraData satisfies Sutra;
export const diamondSutraCharacters = diamondSutra.sections.flatMap((section) =>
  Array.from(section.text).filter((character) => /[\u3400-\u9fff]/u.test(character)),
);

export function getSectionAt(index: number) {
  return (
    diamondSutra.sections.find(
      (section) => index >= section.startIndex && index < section.endIndex,
    ) ?? diamondSutra.sections.at(-1)!
  );
}

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
