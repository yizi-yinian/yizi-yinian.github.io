import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const expectedTitles = [
  "法會因由分", "善現啟請分", "大乘正宗分", "妙行無住分",
  "如理實見分", "正信希有分", "無得無說分", "依法出生分",
  "一相無相分", "莊嚴淨土分", "無為福勝分", "尊重正教分",
  "如法受持分", "離相寂滅分", "持經功德分", "能淨業障分",
  "究竟無我分", "一體同觀分", "法界通化分", "離色離相分",
  "非說所說分", "無法可得分", "淨心行善分", "福智無比分",
  "化無所化分", "法身非相分", "無斷無滅分", "不受不貪分",
  "威儀寂靜分", "一合理相分", "知見不生分", "應化非真分",
];
const expectedHanSha256 = "76977fc3818065de90368debe714f556a5430733db4da02ee69e77c7f4606ea7";
const diamondData = JSON.parse(
  await readFile(path.join(process.cwd(), "app/data/diamond-sutra.json"), "utf8"),
);

if (diamondData.sections.length !== 32) throw new Error("Expected exactly 32 sections.");
if (diamondData.sections.map((section) => section.title).join("|") !== expectedTitles.join("|")) {
  throw new Error("The 32 section titles have changed.");
}

let expectedStart = 0;
for (const section of diamondData.sections) {
  const count = Array.from(section.text).filter((character) => /[\u3400-\u9fff]/u.test(character)).length;
  if (section.startIndex !== expectedStart || section.endIndex !== expectedStart + count) {
    throw new Error(`Invalid character offsets in section ${section.id}.`);
  }
  if (section.characterCount !== count) {
    throw new Error(`Invalid character count in section ${section.id}.`);
  }
  expectedStart += count;
}

if (expectedStart !== 5129 || diamondData.characterCount !== 5129) {
  throw new Error("The canonical Han-character count must remain 5,129.");
}

const fullText = diamondData.sections.map((section) => section.text).join("");
const normalizedHan = fullText.replace(/[^\u3400-\u9fff]/gu, "");
const digest = createHash("sha256").update(normalizedHan).digest("hex");
if (digest !== expectedHanSha256 || digest !== diamondData.source.normalizedHanSha256) {
  throw new Error("The scripture text differs from the verified CBETA import.");
}

if (!fullText.includes("著衣持鉢") || !fullText.endsWith("皆大歡喜，信受奉行。")) {
  throw new Error("Canonical opening or closing phrases are missing.");
}

const expectedHeartHanSha256 = "02c4027a60b4bd1f30dae691962b6b3323c9d911f10712dcda99bdc317d172d1";
const heartData = JSON.parse(
  await readFile(path.join(process.cwd(), "app/data/heart-sutra.json"), "utf8"),
);
if (heartData.sections.length !== 1 || heartData.sections[0].title !== "般若波羅蜜多心經") {
  throw new Error("The Heart Sutra must remain one canonical volume.");
}

const heartText = heartData.sections[0].text;
const normalizedHeartHan = heartText.replace(/[^\u3400-\u9fff]/gu, "");
const heartDigest = createHash("sha256").update(normalizedHeartHan).digest("hex");
if (
  heartData.characterCount !== 260
  || heartData.sections[0].characterCount !== 260
  || heartData.sections[0].startIndex !== 0
  || heartData.sections[0].endIndex !== 260
) {
  throw new Error("The canonical Heart Sutra Han-character count must remain 260.");
}
if (heartDigest !== expectedHeartHanSha256 || heartDigest !== heartData.source.normalizedHanSha256) {
  throw new Error("The Heart Sutra text differs from the verified CBETA import.");
}
if (
  !heartText.startsWith("觀自在菩薩行深般若波羅蜜多時")
  || !heartText.endsWith("揭帝揭帝般羅揭帝般羅僧揭帝菩提莎婆訶」")
) {
  throw new Error("Canonical Heart Sutra opening or mantra is missing.");
}

console.log("Verified CBETA T08 No. 235: 32 sections, 5,129 Han characters.");
console.log("Verified CBETA T08 No. 251: 1 volume, 260 Han characters.");
