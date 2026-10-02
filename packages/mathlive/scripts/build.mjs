// Builds dist/ from src/: the browser and node bundles, the two stylesheets, the fonts and the
// type declarations. Replaces upstream's build.sh so it runs the same on Windows.
import { build } from 'esbuild';
import lessPlugin from '@arnog/esbuild-plugin-less';
import less from 'less';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const options = {
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  define: {
    ENV: '"production"',
    SDK_VERSION: JSON.stringify(version),
    GIT_VERSION: '"?.?.?"',
  },
  plugins: [lessPlugin()],
  loader: { '.ts': 'ts' },
  drop: ['debugger'],
  pure: ['console.assert', 'console.log'],
  external: ['@cortex-js/compute-engine'],
  banner: { js: `/** MathLive ${version} (texpile) */` },
  logLevel: 'warning',
};

await Promise.all([
  build({
    ...options,
    entryPoints: ['src/mathlive.ts'],
    outfile: 'dist/mathlive.mjs',
    sourcemap: true,
  }),
  build({
    ...options,
    entryPoints: ['src/public/mathlive-ssr.ts'],
    outfile: 'dist/mathlive-ssr.mjs',
  }),
]);

for (const name of ['mathlive-static', 'mathlive-fonts']) {
  const file = path.join(root, 'css', `${name}.less`);
  const { css } = await less.render(fs.readFileSync(file, 'utf8'), {
    filename: file,
  });
  fs.writeFileSync(path.join(dist, `${name}.css`), css);
}
fs.cpSync(path.join(root, 'css/fonts'), path.join(dist, 'fonts'), {
  recursive: true,
});

// declarations: tsc into build/, then only the public surface ships, as upstream's package does
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const declarations = path.join(root, 'build/declarations');
execFileSync(
  process.execPath,
  [
    tsc,
    '-p',
    'tsconfig.json',
    '--declaration',
    '--emitDeclarationOnly',
    '--outDir',
    declarations,
  ],
  {
    cwd: root,
    stdio: 'inherit',
  }
);
const types = path.join(dist, 'types');
fs.cpSync(path.join(declarations, 'src/public'), types, { recursive: true });
for (const file of fs.readdirSync(types)) {
  const at = path.join(types, file);
  const text = fs
    .readFileSync(at, 'utf8')
    // bare side-effect imports name modules that are not shipped (upstream issue #3030)
    .replace(/^import [^A-Za-z_{*].*\n/gm, '')
    .replaceAll('{{SDK_VERSION}}', version)
    .replace(/types="public/g, 'types=".');
  fs.writeFileSync(at, text);
}

for (const file of ['mathlive.mjs', 'mathlive-ssr.mjs']) {
  const at = path.join(dist, file);
  fs.writeFileSync(
    at,
    fs.readFileSync(at, 'utf8').replaceAll('{{SDK_VERSION}}', version)
  );
}
