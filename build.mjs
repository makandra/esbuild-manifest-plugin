////
// Compiles our TypeScript from /src to dist/ twice for two different module formats:
//   ESM:       dist/index.js   + dist/index.d.ts   (code and types for `import` consumers)
//   CommonJS:  dist/index.cjs  + dist/index.d.cts  (code and types for `require` consumers)
//
import { execSync } from 'node:child_process'
import { copyFileSync, readdirSync, rmSync } from 'node:fs'
import * as esbuild from 'esbuild'

rmSync('dist', { recursive: true, force: true })

execSync('tsc --project tsconfig.build.json --emitDeclarationOnly --declaration', {
  stdio: 'inherit',
})

// tsc emits the shared type declarations (.d.ts); we copy them to .d.cts so
// TypeScript can resolve types for CJS consumers via the package.json "exports" map.
// esbuild then compiles the actual JS for both formats in parallel.
for (const file of readdirSync('dist').filter(f => f.endsWith('.d.ts'))) {
  copyFileSync(`dist/${file}`, `dist/${file.replace(/\.d\.ts$/, '.d.cts')}`)
}

await Promise.all([
  esbuild.build({
    entryPoints: ['src/index.ts'],
    format: 'esm',
    outfile: 'dist/index.js',
    platform: 'node',
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: ['src/index.ts'],
    format: 'cjs',
    outfile: 'dist/index.cjs',
    platform: 'node',
    sourcemap: true,
    // esbuild's CJS output puts the default export on module.exports.default.
    // Object.assign merges it back so `require('pkg')` returns the function directly,
    // while `require('pkg').default` still works for TypeScript's esModuleInterop.
    footer: { js: 'module.exports = Object.assign(module.exports.default, module.exports);' },
  }),
])
