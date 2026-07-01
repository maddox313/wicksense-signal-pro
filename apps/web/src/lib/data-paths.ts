import path from "path";

/** Writable directory for engine config and *.local.json files. */
export function getDataDir(): string {
  if (process.env.WICKSENSE_WEB_ROOT?.trim()) {
    return path.resolve(process.env.WICKSENSE_WEB_ROOT.trim());
  }
  return process.cwd();
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
