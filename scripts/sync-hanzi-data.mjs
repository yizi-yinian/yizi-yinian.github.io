import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const pageSource = await readFile(path.join(projectRoot, "app/page.tsx"), "utf8");
const passageMatch = pageSource.match(/const passage\s*=\s*\n?\s*"([^"]+)"/u);

if (!passageMatch) {
  throw new Error("Could not find the scripture passage in app/page.tsx");
}

const characters = [...new Set(Array.from(passageMatch[1]).filter((character) => /[\u3400-\u9fff]/u.test(character)))];
const sourceDirectory = path.join(projectRoot, "node_modules/hanzi-writer-data");
const targetDirectory = path.join(projectRoot, "public/hanzi-data");

await mkdir(targetDirectory, { recursive: true });
await Promise.all(
  characters.map((character) =>
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

console.log(`Prepared ${characters.length} local Hanzi data files.`);
