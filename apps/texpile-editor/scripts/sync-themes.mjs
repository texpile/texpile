// Copies Skeleton's preset themes into public/themes/ and writes themes/index.json: each theme's
// name, label and the five colours a picker tile needs (its primary, both grounds, both panels).
// Runs from `pnpm sync`, so the files track the installed Skeleton version instead of living in git.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@skeletonlabs/skeleton/src/themes');
const out = join(root, 'public/themes');
mkdirSync(out, { recursive: true });

// file names are lower-case single words; the two that are really two words get their spelling back
const LABELS = { rosepine: 'Rosé Pine', hamlindigo: 'Hamlindigo' };

function swatch(css) {
	const get = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
	const s = {
		primary: get('--color-primary-500'),
		surfaceLight: get('--color-surface-50'),
		surfaceDark: get('--color-surface-950'),
		panelLight: get('--color-surface-200'),
		panelDark: get('--color-surface-800')
	};
	return Object.values(s).every(Boolean) ? s : null;
}

const entries = [{ name: 'theme', label: 'Texpile', swatch: swatch(readFileSync(join(root, 'texpile-default-theme.css'), 'utf8')) }];
for (const file of readdirSync(src)
	.filter((f) => f.endsWith('.css'))
	.sort()) {
	const name = file.slice(0, -4);
	const s = swatch(readFileSync(join(src, file), 'utf8'));
	if (!s) continue;
	copyFileSync(join(src, file), join(out, file));
	entries.push({ name, label: LABELS[name] ?? name[0].toUpperCase() + name.slice(1), swatch: s });
}
writeFileSync(join(out, 'index.json'), JSON.stringify(entries));
console.log(`themes: ${entries.length - 1} presets + default -> public/themes`);
