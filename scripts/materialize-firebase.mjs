import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const partsDir = path.join(root, "lib", "firebase.parts");
const targetPath = path.join(root, "lib", "firebase.ts");
const expectedSha256 = "4fe793b9e21aa966cb97159ad05951ae7bd09ebe2bd4c35069c1ec6581fa7243";

const names = (await readdir(partsDir))
  .filter((name) => name.endsWith(".b64"))
  .sort();

if (!names.length) throw new Error("Firebase adapter parts are missing");

const encoded = (await Promise.all(
  names.map((name) => readFile(path.join(partsDir, name), "utf8")),
)).join("");

const source = Buffer.from(encoded, "base64");
const actualSha256 = createHash("sha256").update(source).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error(`Firebase adapter checksum mismatch: ${actualSha256}`);
}

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, source);
console.log("[firebase] materialized verified lib/firebase.ts");
