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
const data = JSON.parse(
  await readFile(path.join(process.cwd(), "app/data/diamond-sutra.json"), "utf8"),
);

if (data.sections.length !== 32) throw new Error("Expected exactly 32 sections.");
if (data.sections.map((section) => section.title).join("|") !== expectedTitles.join("|")) {
  throw new Error("The 32 section titles have changed.");
}

let expectedStart = 0;
for (const section of data.sections) {
  const count = Array.from(section.text).filter((character) => /[\u3400-\u9fff]/u.test(character)).length;
  if (section.startIndex !== expectedStart || section.endIndex !== expectedStart + count) {
    throw new Error(`Invalid character offsets in section ${section.id}.`);
  }
  if (section.characterCount !== count) {
    throw new Error(`Invalid character count in section ${section.id}.`);
  }
  expectedStart += count;
}

if (expectedStart !== 5129 || data.characterCount !== 5129) {
  throw new Error("The canonical Han-character count must remain 5,129.");
}

const fullText = data.sections.map((section) => section.text).join("");
const normalizedHan = fullText.replace(/[^\u3400-\u9fff]/gu, "");
const digest = createHash("sha256").update(normalizedHan).digest("hex");
if (digest !== expectedHanSha256 || digest !== data.source.normalizedHanSha256) {
  throw new Error("The scripture text differs from the verified CBETA import.");
}

if (!fullText.includes("著衣持鉢") || !fullText.endsWith("皆大歡喜，信受奉行。")) {
  throw new Error("Canonical opening or closing phrases are missing.");
}

console.log("Verified CBETA T08 No. 235: 32 sections, 5,129 Han characters.");
