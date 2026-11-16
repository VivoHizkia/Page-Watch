import { readFile } from "node:fs/promises";
import { z } from "zod";

// The list of watched pages, read from watch.config.json.

const PageSchema = z.object({
  // Short name used in reports and as the snapshot file name.
  name: z.string().trim().min(1).max(80),
  url: z.url({ protocol: /^https?$/ }),
  // CSS selector for the part to watch. Left out, the page's main content is used.
  selector: z.string().trim().min(1).optional(),
  // Lines matching any of these patterns are dropped before comparing, e.g. a
  // "Last updated ..." stamp or a visitor counter that changes on every request.
  ignore: z.array(z.string().min(1)).default([]),
});

const ConfigSchema = z.object({
  pages: z.array(PageSchema).min(1).max(50),
});

export type Page = z.infer<typeof PageSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ConfigError(`watch.config.json: ${issue.path.join(".")}: ${issue.message}`);
  }

  const names = new Set<string>();
  for (const page of result.data.pages) {
    // Two pages with the same slug would overwrite each other's snapshot.
    const key = slug(page.name);
    if (names.has(key)) {
      throw new ConfigError(`watch.config.json: the name "${page.name}" is used twice`);
    }
    names.add(key);

    for (const pattern of page.ignore) {
      try {
        new RegExp(pattern);
      } catch {
        throw new ConfigError(`watch.config.json: invalid ignore pattern: ${pattern}`);
      }
    }
  }
  return result.data;
}

export async function readConfig(file: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new ConfigError(`Cannot read ${file}`);
  }

  try {
    return parseConfig(JSON.parse(text));
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`${file} is not valid JSON`);
  }
}

// "Node.js Releases!" becomes "node-js-releases". It is used as a file name, so only letters,
// digits and hyphens may remain.
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}
