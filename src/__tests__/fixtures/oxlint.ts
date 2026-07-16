import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {expect} from "vitest";

export async function getOxlintTester() {
  const oxlintBinPath = path.resolve(import.meta.dirname, "../../../node_modules/.bin/oxlint");
  const projectRoot = path.resolve(import.meta.dirname, "project");
  const tmpDir = await fs.mkdtempDisposable(path.join(os.tmpdir(), "oxlint-plugin-import-access-"));
  const configPath = path.join(tmpDir.path, ".oxlintrc.json");
  const pluginPath = path.resolve(import.meta.dirname, "../../../dist/index.js");

  return {
    async lintFile(filePath: string, config?: { jsdoc?: unknown }) {
      await fs.writeFile(
        configPath,
        JSON.stringify({
          jsPlugins: [{ name: "import-access", specifier: pluginPath }],
          plugins: [],
          categories: {
            correctness: "off",
            suspicious: "off",
            pedantic: "off",
            perf: "off",
            style: "off",
            restriction: "off",
          },
          rules: {
            "import-access/jsdoc": config?.jsdoc ? ["error", config.jsdoc] : "error",
          },
        }),
      );

      const result = childProcess.spawnSync(
        oxlintBinPath,
        ["--format", "sarif", "--config", configPath, filePath],
        { cwd: projectRoot },
      );

      if (result.stderr.length > 0) {
        console.error(result.stderr.toString());
      }

      const diagnostics: SarifDiagnostic[] = JSON.parse(result.stdout.toString()).runs[0].results;

      return diagnostics.map((diag) => {
        const region = diag.locations[0].physicalLocation.region;

        return {
          column: region.startColumn,
          endColumn: region.endColumn,
          endLine: region.endLine,
          line: region.startLine,
          message: diag.message.text,
          messageId: diag.message.text.startsWith("Cannot import a private export ")
            ? "private"
            : diag.message.text.startsWith("Cannot re-export ")
              ? "package:reexport"
              : "package",
          ruleId: diag.ruleId.replace(/\((\w+)\)$/, "/$1"),
          severity: diag.level === "error" ? 2 : 0,
        };
      });
    },
    async close() {
      await tmpDir.remove();
    },
  };
}

interface SarifDiagnostic {
  level: "error";
  locations: {
    physicalLocation: {
      region: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      };
    };
  }[];
  message: {
    text: string;
  };
  ruleId: string;
}
