import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sectionDefinitions = [
  ["法會因由分", "如是我聞："],
  ["善現啟請分", "時，長老須菩提"],
  ["大乘正宗分", "佛告須菩提：「諸菩薩摩訶薩"],
  ["妙行無住分", "「復次，須菩提！菩薩於法"],
  ["如理實見分", "「須菩提！於意云何？可以身相見如來不？"],
  ["正信希有分", "須菩提白佛言：「世尊！頗有眾生，得聞如是言說章句"],
  ["無得無說分", "「須菩提！於意云何？如來得阿耨多羅三藐"],
  ["依法出生分", "「須菩提！於意云何？若人滿三千大千世界"],
  ["一相無相分", "「須菩提！於意云何？須陀洹能作是念"],
  ["莊嚴淨土分", "佛告須菩提：「於意云何？如來昔在然燈佛所"],
  ["無為福勝分", "「須菩提！如恒河中所有沙數"],
  ["尊重正教分", "「復次，須菩提！隨說是經"],
  ["如法受持分", "爾時，須菩提白佛言：「世尊！當何名此經"],
  ["離相寂滅分", "爾時，須菩提聞說是經，深解義趣"],
  ["持經功德分", "「須菩提！若有善男子、善女人，初日分"],
  ["能淨業障分", "「復次，須菩提！善男子、善女人受持、讀誦此經"],
  ["究竟無我分", "爾時，須菩提白佛言：「世尊！善男子、善女人發"],
  ["一體同觀分", "「須菩提！於意云何？如來有肉眼不？"],
  ["法界通化分", "「須菩提！於意云何？若有人滿三千大千世界七寶"],
  ["離色離相分", "「須菩提！於意云何？佛可以具足色身見"],
  ["非說所說分", "「須菩提！汝勿謂如來作是念"],
  ["無法可得分", "須菩提白佛言：「世尊！佛得阿耨多羅三藐"],
  ["淨心行善分", "「復次，須菩提！是法平等"],
  ["福智無比分", "「須菩提！若三千大千世界中所有諸須彌山"],
  ["化無所化分", "「須菩提！於意云何？汝等勿謂如來作是念"],
  ["法身非相分", "「須菩提！於意云何？可以三十二相觀如來不？"],
  ["無斷無滅分", "「須菩提！汝若作是念：『如來不以具足相故"],
  ["不受不貪分", "「須菩提！若菩薩以滿恒河沙等世界七寶布施"],
  ["威儀寂靜分", "「須菩提！若有人言『如來若來若去、若坐若臥』"],
  ["一合理相分", "「須菩提！若善男子、善女人以三千大千世界碎為微塵"],
  ["知見不生分", "「須菩提！若人言『佛說我見、人見、眾生見、壽者見』"],
  ["應化非真分", "「須菩提！若有人以滿無量阿僧祇世界七寶"],
];

const xmlPath = process.argv[2];
if (!xmlPath) {
  throw new Error("Usage: node scripts/import-diamond-sutra.mjs <T08n0235.xml>");
}

const xml = await readFile(xmlPath, "utf8");
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

const traditionalParagraphs = decodeXml(
  body
    .replace(/<\/(?:p|lg)>/gu, "¶")
    .replace(/<(?:lb|pb)[^>]*\/>/gu, "")
    .replace(/<[^>]+>/gu, ""),
)
  .split("¶")
  .map((paragraph) => paragraph.replace(/\s+/gu, "").trim())
  .filter(Boolean);

const traditionalText = traditionalParagraphs.join("\n");
if (!traditionalText.includes("著衣持鉢")) {
  throw new Error("The canonical phrase ‘著衣持鉢’ is missing.");
}

const boundaries = sectionDefinitions.map(([title, marker], index) => {
  const start = traditionalText.indexOf(marker);
  if (start < 0) {
    throw new Error(`Could not locate section ${index + 1} ${title}: ${marker}`);
  }
  if (traditionalText.indexOf(marker, start + 1) >= 0) {
    throw new Error(`Section marker is not unique: ${marker}`);
  }
  return start;
});

if (boundaries.some((start, index) => index > 0 && start <= boundaries[index - 1])) {
  throw new Error("Section markers are not in canonical order.");
}

const hanCharacters = (value) => Array.from(value).filter((character) => /[\u3400-\u9fff]/u.test(character));
let characterOffset = 0;
const sections = sectionDefinitions.map(([title], index) => {
  const text = traditionalText.slice(boundaries[index], boundaries[index + 1] ?? traditionalText.length).trim();
  const characterCount = hanCharacters(text).length;
  const section = {
    id: index + 1,
    title,
    text,
    startIndex: characterOffset,
    endIndex: characterOffset + characterCount,
    characterCount,
  };
  characterOffset += characterCount;
  return section;
});

const normalizedTraditional = sections.map((section) => section.text).join("").replace(/[^\u3400-\u9fff]/gu, "");

const data = {
  id: "diamond-sutra",
  title: "金剛般若波羅蜜經",
  shortTitle: "金剛經",
  translator: "姚秦·鳩摩羅什譯",
  script: "繁體",
  source: {
    label: "CBETA《大正新脩大藏經》T08 No. 235",
    url: "https://cbetaonline.dila.edu.tw/zh/T0235_001",
    xmlUrl: "https://github.com/cbeta-org/xml-p5/blob/master/T/T08/T08n0235.xml",
    xmlRevision: "2026-02-09",
    xmlSha256: createHash("sha256").update(xml).digest("hex"),
    normalizedHanSha256: createHash("sha256").update(normalizedTraditional).digest("hex"),
  },
  characterCount: characterOffset,
  sections,
};

const outputPath = path.join(process.cwd(), "app/data/diamond-sutra.json");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Imported ${sections.length} sections and ${characterOffset} Han characters.`);
