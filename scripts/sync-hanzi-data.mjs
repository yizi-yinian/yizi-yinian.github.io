import { copyFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const scriptureFiles = ["diamond-sutra.json", "heart-sutra.json"];
const scriptures = await Promise.all(
  scriptureFiles.map(async (fileName) =>
    JSON.parse(await readFile(path.join(projectRoot, "app/data", fileName), "utf8")),
  ),
);
const coverage = JSON.parse(
  await readFile(path.join(projectRoot, "app/data/hanzi-writer-coverage.json"), "utf8"),
);
const characters = [
  ...new Set(
    scriptures.flatMap((scripture) =>
      scripture.sections.flatMap((section) =>
        Array.from(section.text).filter((character) => /[\u3400-\u9fff]/u.test(character)),
      ),
    ),
  ),
];
const sourceDirectory = path.join(projectRoot, "node_modules/hanzi-writer-data");
const targetDirectory = path.join(projectRoot, "public/hanzi-data");
const freehandFallback = new Set(coverage.freehandFallback);
const availableCharacters = characters.filter((character) => !freehandFallback.has(character));

for (const character of characters) {
  const sourcePath = path.join(sourceDirectory, `${character}.json`);
  const exists = await readFile(sourcePath, "utf8").then(() => true, () => false);
  if (exists === freehandFallback.has(character)) {
    throw new Error(
      exists
        ? `Remove ${character} from the freehand fallback list; Hanzi Writer data is now available.`
        : `Missing Hanzi Writer data for ${character}; add an explicit fallback before building.`,
    );
  }
}

await mkdir(targetDirectory, { recursive: true });
const requiredFiles = new Set(availableCharacters.map((character) => `${character}.json`));
const existingFiles = await readdir(targetDirectory, { withFileTypes: true });
await Promise.all(
  existingFiles
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json") && !requiredFiles.has(entry.name),
    )
    .map((entry) => unlink(path.join(targetDirectory, entry.name))),
);
await Promise.all(
  availableCharacters.map((character) =>
    copyFile(
      path.join(sourceDirectory, `${character}.json`),
      path.join(targetDirectory, `${character}.json`),
    ),
  ),
);
await copyFile(
  path.join(sourceDirectory, "ARPHICPL.TXT"),
  path.join(targetDirectory, "ARPHICPL.TXT"),
);

console.log(
  `Prepared ${availableCharacters.length} Hanzi Writer files; ${freehandFallback.size} rare variants use freehand fallback.`,
);
