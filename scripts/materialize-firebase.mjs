import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";

const unzip = promisify(gunzip);
const root = process.cwd();
const sourcePath = path.join(root, "lib", "firebase.ts.gz");
const targetPath = path.join(root, "lib", "firebase.ts");

await mkdir(path.dirname(targetPath), { recursive: true });
const packed = await readFile(sourcePath);
const source = await unzip(packed);
await writeFile(targetPath, source);
console.log("[firebase] materialized lib/firebase.ts");
