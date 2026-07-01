import path from "path";

/** Writable directory for engine config and *.local.json files (app working directory). */
export function getDataDir(): string {
  return process.cwd();
}

export function dataFile(filename: string): string {
  return path.join(getDataDir(), filename);
}
