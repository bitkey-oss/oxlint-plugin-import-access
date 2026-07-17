# oxlint-plugin-import-access

> [!WARNING]
> This plugin uses the **unstable** API in TypeScript 7.

Port of [uhyo/eslint-plugin-import-access](https://github.com/uhyo/eslint-plugin-import-access) for Oxlint powered by TypeScript 7 (typescript-go).

It uses the TypeScript 7 API directly instead of the typescript-eslint API.

It targets Oxlint so we can get better performance.

## Installation

```shell
npm add -D oxlint-plugin-import-access
```

### Oxlint Configuration

```ts
export default defineConfig({
  jsPlugins: ["oxlint-plugin-import-access"],
  rules: {
    "import-access/jsdoc": "error",
  },
});
```

For more information, refer to the [upstream documentation](https://github.com/uhyo/eslint-plugin-import-access#readme).

## Options

In addition to the [upstream options](https://github.com/uhyo/eslint-plugin-import-access#options), this plugin provides the following options specific to this Oxlint port.

### `projects`

Type: `string[]`

Array of paths to `tsconfig.json` files. When specified, only these projects are loaded as TypeScript projects instead of auto-discovering `tsconfig.json` files under the current working directory.

Relative paths are resolved from the current working directory.

Use this option when auto-discovery is too slow or picks up unwanted tsconfig files.

```ts
export default defineConfig({
  jsPlugins: ["oxlint-plugin-import-access"],
  rules: {
    "import-access/jsdoc": [
      "error",
      {
        projects: ["packages/foo/tsconfig.json", "packages/bar/tsconfig.json"],
      },
    ],
  },
});
```

## Performance

Tested this plugin in a large project with ~7,300 files and ~1,000,000 LOC, on MacBook Pro with M3 Pro chip.

| ESLint + uhyo/eslint-plugin-import-access | Oxlint + oxlint-plugin-import-access | Δ                   |
| ----------------------------------------- | ------------------------------------ | ------------------- |
| 35.69 sec                                 | **5.65 sec**                         | **6.31x** (-84.16%) |

## Limitation

- This plugin doesn't provide a plugin for the TypeScript Language Service.
