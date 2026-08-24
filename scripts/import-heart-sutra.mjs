import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const xmlPath = process.argv[2];
if (!xmlPath) {
  throw new Error("Usage: node scripts/import-heart-sutra.mjs <T08n0251.xml>");
}

const xml = await readFile(xmlPath, "utf8");
const xmlRevision = xml.match(/<date>(\d{4}-\d{2}-\d{2})/u)?.[1];
if (!xmlRevision) {
  throw new Error("Could not determine the CBETA XML revision date.");
}
const body = xml.match(/<cb:div type="jing">([\s\S]*?)<\/cb:div>/u)?.[1];
if (!body) {
  throw new Error("Could not find the CBETA scripture body.");
}

const decodeXml = (value) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const paragraphs = decodeXml(
  body
    .replace(/<\/(?:p|lg)>/gu, "¶")
    .replace(/<(?:lb|pb)[^>]*\/>/gu, "")
    .replace(/<[^>]+>/gu, ""),
)
  .split("¶")
  .map((paragraph) => paragraph.replace(/\s+/gu, "").trim())
  .filter(Boolean);

if (paragraphs.length !== 7) {
  throw new Error(`Expected 7 canonical paragraphs, found ${paragraphs.length}.`);
}

const text = paragraphs.join("\n");
const hanCharacters = Array.from(text).filter((character) => /[\u3400-\u9fff]/u.test(character));
const normalizedHan = hanCharacters.join("");

if (!text.startsWith("觀自在菩薩行深般若波羅蜜多時")) {
  throw new Error("The canonical opening phrase is missing.");
}
if (!text.endsWith("揭帝揭帝般羅揭帝般羅僧揭帝菩提莎婆訶」")) {
  throw new Error("The verified CBETA mantra is missing or altered.");
}

const data = {
  id: "heart-sutra",
  title: "般若波羅蜜多心經",
  shortTitle: "心經",
  translator: "唐·玄奘譯",
  script: "繁體",
  sectionUnit: "卷",
  source: {
    label: "CBETA《大正新脩大藏經》T08 No. 251",
    url: "https://cbetaonline.dila.edu.tw/zh/T0251_001",
    xmlUrl: "https://github.com/cbeta-org/xml-p5/blob/master/T/T08/T08n0251.xml",
    xmlRevision,
    xmlSha256: createHash("sha256").update(xml).digest("hex"),
    normalizedHanSha256: createHash("sha256").update(normalizedHan).digest("hex"),
  },
  characterCount: hanCharacters.length,
  sections: [
    {
      id: 1,
      title: "般若波羅蜜多心經",
      text,
      startIndex: 0,
      endIndex: hanCharacters.length,
      characterCount: hanCharacters.length,
    },
  ],
};

const outputPath = path.join(process.cwd(), "app/data/heart-sutra.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Imported ${paragraphs.length} paragraphs and ${hanCharacters.length} Han characters.`);
