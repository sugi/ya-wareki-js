import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    // tsdown >=0.16 defaults ESM output to .mjs/.d.mts; force back to .js/.d.ts
    // to match the package.json exports map.
    outExtensions: (ctx) => ({
      js: ctx.format === 'cjs' ? '.cjs' : '.js',
      dts: ctx.format === 'cjs' ? '.d.cts' : '.d.ts',
    }),
  },
  {
    entry: { 'index.iife.min': 'src/index.ts' },
    format: ['iife'],
    globalName: 'YaWareki',
    minify: true,
    dts: false,
    clean: false,
    // IIFE は <script> 1枚で完結させるため ya-kansuji をバンドルに取り込む。
    // ESM/CJS ビルドでは dependencies が既定で external になるので通常の依存のまま。
    noExternal: ['ya-kansuji'],
    // tsdown appends a `.iife` format suffix by default; entryFileNames
    // pins the exact filename instead.
    outputOptions: {
      entryFileNames: '[name].js',
    },
    // rolldown's IIFE output declares `var YaWareki = ...`, which stays
    // function-scoped (and invisible on globalThis) when the file is
    // loaded via CommonJS require() (Node wraps required files in a
    // function) instead of a browser <script> tag. footer runs outside
    // the IIFE wrapper, so it can assign the local var onto globalThis
    // explicitly, making both loading styles work.
    footer: 'globalThis.YaWareki = YaWareki;',
  },
])
