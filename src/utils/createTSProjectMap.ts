import path from "node:path";

import { Project, Snapshot } from "typescript/unstable/sync";

interface TSProjectMap {
  tsconfigs: string[];
  getProjectForFile(filename: string): Project | undefined;
}

// Cache Project per tsconfig directory. The first file encountered in each
// directory triggers one getDefaultProjectForFile RPC; subsequent files use
// the cache. This reduces RPC calls from O(files) to O(unique projects).
export default function createTSProjectMap(snapshot: Snapshot, tsconfigs: string[]): TSProjectMap {
  const tsConfigDirs = tsconfigs.map((t) => path.dirname(t)).sort((a, b) => b.length - a.length);

  const projectCache = new Map<string, Project | null>();

  return {
    tsconfigs,
    getProjectForFile(filename: string): Project | undefined {
      const matchingDir = tsConfigDirs.find((dir) => filename.startsWith(dir + "/"));
      if (!matchingDir) {
        return undefined;
      }

      if (!projectCache.has(matchingDir)) {
        projectCache.set(matchingDir, snapshot.getDefaultProjectForFile(filename) ?? null);
      }

      return projectCache.get(matchingDir) ?? undefined;
    },
  };
}
