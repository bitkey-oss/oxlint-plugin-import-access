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

## Limitation

- This plugin doesn't provide a plugin for the TypeScript Language Service.
