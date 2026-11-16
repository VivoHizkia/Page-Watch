import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slug } from "./config";

// The latest snapshot of each page is kept as a plain text file in snapshots/. Because the
// files are committed, the git history doubles as the page's change history and `git diff`
// can read it.

export type SnapshotStore = {
  // null when the page has never been checked before.
  read(name: string): Promise<string[] | null>;
  write(name: string, lines: string[]): Promise<void>;
};

export function fileSnapshotStore(folder: string): SnapshotStore {
  const fileFor = (name: string) => path.join(folder, `${slug(name)}.txt`);

  return {
    async read(name) {
      try {
        const text = await readFile(fileFor(name), "utf8");
        return text.split("\n").filter((line) => line !== "");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async write(name, lines) {
      await mkdir(folder, { recursive: true });
      await writeFile(fileFor(name), `${lines.join("\n")}\n`);
    },
  };
}
