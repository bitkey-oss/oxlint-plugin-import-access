import { readFileSync } from "node:fs";
import path from "node:path";

interface PackageJsonResult {
  packageJson: any;
  packageJsonPath: string;
  dir: string;
}

export function lookupPackageJson(file: string): PackageJsonResult | null {
  const absolutePath = path.resolve(file);
  const { root } = path.parse(absolutePath);
  let dir = path.dirname(absolutePath);
  while (root !== dir) {
    const packageJsonPath = path.join(dir, "package.json");
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return {
        packageJson,
        packageJsonPath,
        dir,
      };
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && e.code !== "ENOENT") {
        throw e;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

const packageJsonCache = new Map<string, PackageJsonResult>();

export function lookupPackageJsonCached(file: string): PackageJsonResult | null {
  const cached = packageJsonCache.get(path.dirname(file));
  if (cached) {
    return cached;
  }

  const result = lookupPackageJson(file);
  if (result) {
    let dir = path.dirname(file);
    while (dir !== result.dir) {
      packageJsonCache.set(dir, result);
      dir = path.dirname(dir);
    }
  }

  return result;
}
