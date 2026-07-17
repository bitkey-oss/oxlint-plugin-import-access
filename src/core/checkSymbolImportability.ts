import path from "node:path";

import { minimatch } from "minimatch";
import { Project, Symbol } from "typescript/unstable/sync";

import { assertNever } from "../utils/assertNever.js";
import { concatArrays } from "../utils/concatArrays.js";
import { findExportedDeclaration } from "../utils/findExportableDeclaration.js";
import { getAccessOfJsDocs } from "../utils/getAccessOfJsDocs.js";
import { Tag, getJSDocTags } from "../utils/getJSDocTags.js";
import { PackageOptions, isInPackage } from "../utils/isInPackage.js";
import { measure } from "../utils/timings.js";
import { lookupPackageJsonCached } from "./lookupPackageJson.js";

/**
 * Result of checking a symbol.
 * A non-undefined return value means an error
 */
export type CheckSymbolResult = "package" | "private" | undefined;

export function checkSymbolImportability(
  packageOptions: PackageOptions,
  project: Project,
  importerFilename: string,
  moduleSpecifier: string,
  exportedSymbol: Symbol,
): CheckSymbolResult {
  const program = project.program;

  const rawDecl = measure("resolveSymbol", () => exportedSymbol.declarations?.[0]?.resolve());
  if (!rawDecl) {
    return;
  }

  const decl = findExportedDeclaration(rawDecl);
  if (!decl) {
    return;
  }

  // Get the actual file name of the exported declaration
  const sourceFile = decl.getSourceFile();
  const exporterFilename = sourceFile.fileName;

  // Check if moduleSpecifier or exporter file path matches any of the excludeSourcePatterns
  if (packageOptions.excludeSourcePatterns?.length) {
    for (const pattern of packageOptions.excludeSourcePatterns) {
      // Check actual file path
      // Get relative path from the project root
      const projectPath = path.dirname(project.configFileName);
      const relativePath = path.relative(projectPath, exporterFilename);

      // Check if the file path matches the pattern
      if (minimatch(relativePath, pattern, { dot: true })) {
        // Skip importability check for this source
        return;
      }
    }
  }

  // If declaration is from external module, treat as importable
  if (program.isSourceFileFromExternalLibrary(sourceFile)) {
    return;
  }

  if (
    packageOptions.treatSelfReferenceAs === "external" &&
    possibleSubpathImportFromPackage.test(moduleSpecifier)
  ) {
    // Check whether this import is the result of a self-reference.
    const lookupResult = measure("lookupPackageJson", () =>
      lookupPackageJsonCached(importerFilename),
    );
    if (lookupResult !== null) {
      if (checkIfImportIsSelfReference(moduleSpecifier, lookupResult.packageJson.name)) {
        // This is a self-reference, so treat as external.
        return;
      }
    }
  }

  const checker = project.checker;

  // found an export declaration
  const jsDocs = concatArrays<Tag>(
    // Prefer JSDoc from the declaration node (handles re-export annotations correctly).
    // Fall back to symbol's JSDoc tags from the checker for other cases.
    getJSDocTags(decl),
    measure("getJsDocTags", () => exportedSymbol.getJsDocTags(checker)).map((tag) => ({
      name: tag.name,
      text: tag.text || "",
    })),
  );
  if (!jsDocs) {
    switch (packageOptions.defaultImportability) {
      case "public":
        return;
      case "private":
        return "private";
      case "package": {
        const inPackage = isInPackage(importerFilename, sourceFile.fileName, packageOptions);
        return inPackage ? undefined : "package";
      }
    }
  }

  const access = getAccessOfJsDocs(jsDocs, packageOptions.defaultImportability);
  if (access === "public") {
    // no restriction
    return;
  }
  if (access === "private") {
    // no import of private stuff! (why is this exported?)
    return "private";
  }
  if (access !== "package") {
    assertNever(access);
  }

  // for package-exports, check relation of this and that files
  const inPackage = isInPackage(importerFilename, sourceFile.fileName, packageOptions);

  return inPackage ? undefined : "package";
}

const possibleSubpathImportFromPackage = /^(?![./\\])([^/\\]*)(?:$|[/\\][^/\\])/;

const checkIfImportIsSelfReference = (moduleSpecifier: string, packageName: string) => {
  const importIsDefaultModule = moduleSpecifier === packageName;
  const importIsSubModule = moduleSpecifier.startsWith(`${packageName}/`);
  return importIsDefaultModule || importIsSubModule;
};
