import path from "node:path";

import { type Context, type ESTree, type Node as OxlintNode, defineRule } from "@oxlint/plugins";
import { type SourceFile } from "typescript/unstable/ast";
import { API, type Project, type Symbol } from "typescript/unstable/sync";

import { checkSymbolImportability } from "../core/checkSymbolImportability.js";
import createTSProjectMap from "../utils/createTSProjectMap.js";
import type { PackageOptions } from "../utils/isInPackage.js";
import { listTSConfigFiles } from "../utils/listTSConfigFiles.js";
import { measure } from "../utils/timings.js";

export type JSDocRuleOptions = {
  /**
   * Whether importing a package-private exports from `index.ts` in a subdirectory.
   */
  indexLoophole: boolean;

  /**
   * Whether importing a package-private exports in a directory from a file of same name.
   */
  filenameLoophole: boolean;

  /**
   * Whether packages importability is restricted to public exports only or not.
   */
  defaultImportability: "public" | "package" | "private";

  /**
   * Whether to treat self-reference as internal or external.
   * When `external`, imports using the self-referencing feature of Node.js are
   * treated as imports from external packages, meaning that they bypass
   * the importability check.
   */
  treatSelfReferenceAs: "internal" | "external";

  /**
   * Array of glob patterns for source paths to exclude from the importability check.
   * Useful for excluding generated files or auto-generated type definitions.
   */
  excludeSourcePatterns?: string[];

  /**
   * Array of glob patterns that specify which directories should be treated as package boundaries.
   * By default, all directories are treated as package boundaries.
   * Use negation patterns (e.g., "!**\/_internal") to exclude certain directories from being package boundaries.
   * Example: ["**", "!**\/_internal"] treats all directories as packages except those named "_internal".
   */
  packageDirectory?: string[];

  /**
   * Array of paths to tsconfig.json files to load as TypeScript projects.
   * When specified, these paths are used instead of auto-discovering tsconfig.json files.
   * Relative paths are resolved from the current working directory.
   */
  projects?: string[];
};

const api = new API();

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Prohibit importing private exports.",
      url: "TODO",
    },
    messages: {
      "no-program":
        "Type information is not available for this file. See https://typescript-eslint.io/getting-started/typed-linting/ for how to set this up.",
      package: "Cannot import a package-private export '{{ identifier }}'",
      "package:reexport": "Cannot re-export a package-private export '{{ identifier }}'",
      private: "Cannot import a private export '{{ identifier }}'",
      "private:reexport": "Cannot re-export a private export '{{ identifier }}'",
    },
    schema: [
      {
        type: "object",
        properties: {
          indexLoophole: {
            type: "boolean",
          },
          filenameLoophole: {
            type: "boolean",
          },
          defaultImportability: {
            type: "string",
            enum: ["public", "package", "private"],
          },
          treatSelfReferenceAs: {
            type: "string",
            enum: ["external", "internal"],
          },
          excludeSourcePatterns: {
            type: "array",
            items: {
              type: "string",
            },
          },
          packageDirectory: {
            type: "array",
            items: {
              type: "string",
            },
          },
          projects: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        indexLoophole: true,
        filenameLoophole: false,
        defaultImportability: "public",
        treatSelfReferenceAs: "external",
        excludeSourcePatterns: [],
        packageDirectory: undefined,
      } as any,
    ],
  },
  createOnce(context) {
    let projectMap: ReturnType<typeof createTSProjectMap> | undefined;

    function getProjectMap() {
      if (!projectMap) {
        const ruleOptions = context.options[0] as JSDocRuleOptions | undefined;
        const tsconfigs = ruleOptions?.projects
          ? ruleOptions.projects.map((p) => path.resolve(process.cwd(), p))
          : listTSConfigFiles(process.cwd());

        const snapshot = measure("updateSnapshot", () =>
          api.updateSnapshot({ openProjects: tsconfigs }),
        );

        projectMap = createTSProjectMap(snapshot, tsconfigs);
      }

      return projectMap;
    }

    let project: Project | undefined;
    let sourceFile: SourceFile | undefined;
    let packageOptions: PackageOptions | undefined;

    return {
      before() {
        sourceFile = undefined;
        packageOptions = undefined;

        const projectMap = getProjectMap();
        if (
          !(project = measure("getProjectForFile", () =>
            projectMap.getProjectForFile(context.filename),
          ))
        ) {
          return;
        }

        // Cache sourceFile once per file to avoid repeated getSourceFile calls in handlers.
        if (
          !(sourceFile = measure("getSourceFile", () =>
            project!.program.getSourceFile(context.filename),
          ))
        ) {
          project = undefined;
          return;
        }

        packageOptions = {
          ...jsDocRuleDefaultOptions(context.options[0] as JSDocRuleOptions),
          projectDirectory: path.dirname(project.configFileName),
        };
      },
      ImportSpecifier(node) {
        if (!project || !packageOptions || !sourceFile) {
          return;
        }

        const importDeclaration = node.parent as ESTree.ImportDeclaration;
        const moduleSpecifier = importDeclaration.source.value;

        const symbol = measure("getSymbolAtPosition", () =>
          project!.checker.getSymbolAtPosition(context.filename, node.local.start),
        );
        if (symbol) {
          checkSymbol(context, packageOptions, project, node, moduleSpecifier, symbol);
        }
      },
      ImportDefaultSpecifier(node) {
        if (!project || !packageOptions || !sourceFile) {
          return;
        }

        const importDeclaration = node.parent as ESTree.ImportDeclaration;
        const moduleSpecifier = importDeclaration.source.value;

        const symbol = measure("getSymbolAtPosition", () =>
          project!.checker.getSymbolAtPosition(context.filename, node.start),
        );
        if (symbol) {
          checkSymbol(context, packageOptions, project, node, moduleSpecifier, symbol);
        }
      },
      ExportSpecifier(node) {
        if (!project || !packageOptions || !sourceFile) {
          return;
        }

        const exportDeclaration = node.parent as ESTree.ExportNamedDeclaration;
        const moduleSpecifier = exportDeclaration.source?.value;
        if (!moduleSpecifier) {
          return;
        }

        const symbol = measure("getSymbolAtPosition", () =>
          project!.checker.getSymbolAtPosition(context.filename, node.local.start),
        );
        if (symbol) {
          checkSymbol(context, packageOptions, project, node, moduleSpecifier, symbol, true);
        }
      },
    };
  },
});

function jsDocRuleDefaultOptions(options: Partial<JSDocRuleOptions> | undefined): JSDocRuleOptions {
  const {
    indexLoophole = true,
    filenameLoophole = false,
    defaultImportability = "public",
    treatSelfReferenceAs = "external",
    excludeSourcePatterns = [],
    packageDirectory = undefined,
  } = options || {};

  return {
    indexLoophole,
    filenameLoophole,
    defaultImportability,
    treatSelfReferenceAs,
    excludeSourcePatterns,
    packageDirectory,
  };
}

function checkSymbol(
  context: Context,
  packageOptions: PackageOptions,
  project: Project,
  originalNode: OxlintNode,
  moduleSpecifier: string,
  symbol: Symbol,
  reexport = false,
): void {
  const checker = project.checker;
  const exsy = measure("getImmediateAliasedSymbol", () =>
    checker.getImmediateAliasedSymbol(symbol),
  );
  if (!exsy) {
    return;
  }

  const checkResult = checkSymbolImportability(
    packageOptions,
    project,
    context.filename,
    moduleSpecifier,
    exsy,
  );

  switch (checkResult) {
    case "package": {
      context.report({
        node: originalNode,
        messageId: reexport ? "package:reexport" : "package",
        data: {
          identifier: exsy.name,
        },
      });
      break;
    }
    case "private": {
      context.report({
        node: originalNode,
        messageId: reexport ? "private:reexport" : "private",
        data: {
          identifier: exsy.name,
        },
      });
      break;
    }
  }
}
