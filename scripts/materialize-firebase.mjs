import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const partsDir = path.join(root, "lib", "firebase.parts");
const targetPath = path.join(root, "lib", "firebase.ts");

const names = (await readdir(partsDir))
  .filter((name) => name.endsWith(".b64"))
  .sort();

if (!names.length) throw new Error("Firebase adapter parts are missing");

const encoded = (await Promise.all(
  names.map((name) => readFile(path.join(partsDir, name), "utf8")),
)).join("").replace(/\s+/g, "");

const source = Buffer.from(encoded, "base64");
if (!source.length) throw new Error("Firebase adapter could not be reconstructed");

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, source);
console.log("[firebase] materialized lib/firebase.ts");
