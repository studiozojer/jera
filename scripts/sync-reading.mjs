// daoUI source distribution: committed copies + file hashes, never a sibling runtime dependency.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.DAOUI_PATH ?? resolve(root, "../daoUI");
const target = resolve(root, "src/dao/reading");
const names = ["index.tsx", "theme.tsx"];
const hash = (text) => createHash("sha256").update(text).digest("hex");
if (process.argv.includes("--check")) {
  const provenance = JSON.parse(
    readFileSync(resolve(target, "provenance.json"), "utf8"),
  );
  for (const name of names) {
    if (hash(readFileSync(resolve(target, name))) !== provenance.files[name])
      throw new Error(
        `daoUI copy drift: ${name}. Edit the canonical source and sync.`,
      );
  }
  console.log("daoUI reading copies match their recorded SHA-256 hashes");
} else {
  mkdirSync(target, { recursive: true });
  const files = {};
  for (const name of names) {
    const text = readFileSync(resolve(source, "rn/reading", name));
    writeFileSync(resolve(target, name), text);
    files[name] = hash(text);
  }
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty = !!execFileSync(
    "git",
    ["-C", source, "status", "--porcelain", "--", "rn/reading"],
    { encoding: "utf8" },
  ).trim();
  writeFileSync(
    resolve(target, "provenance.json"),
    JSON.stringify(
      { source: "daoUI/rn/reading", commit, dirty, files },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Synced daoUI reading components from ${commit}${dirty ? " (working tree; hashes identify exact source)" : ""}`,
  );
}
