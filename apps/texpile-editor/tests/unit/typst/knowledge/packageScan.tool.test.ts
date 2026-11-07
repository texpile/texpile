// writes the static scan of every package in a folder laid out as Typst's package cache, one file per version, the
// first pass of the package data (package-scan/typst in texpile-tools). Inert unless SCAN_PACKAGES is set:
//
//   SCAN_PACKAGES=<cache> SCAN_OUT=<texpile-tools>/package-scan/typst/results/scans pnpm exec vitest run packageScan
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scanPackage } from '$lib/languages/typst/knowledge/scan/scanPackage';
import { packageSpecOf } from '$lib/languages/typst/knowledge/packageSpec';
import type { TypstPackageFile } from '$lib/languages/typst/knowledge/types';

const ROOT = process.env.SCAN_PACKAGES;

it.skipIf(!ROOT)(
	'scans a package cache',
	() => {
		const root = ROOT as string;
		const out = process.env.SCAN_OUT ?? path.join(root, '..', 'scans');
		const scanned = new Map<string, TypstPackageFile | null>();
		function scan(spec: string): TypstPackageFile | null {
			if (scanned.has(spec)) return scanned.get(spec)!;
			scanned.set(spec, null);
			const parsed = packageSpecOf(spec);
			const dir = parsed && path.join(root, parsed.namespace, parsed.name, parsed.version);
			if (!dir || !fs.existsSync(dir)) return null;
			const read = (file: string) => {
				const full = path.join(dir, file);
				return full.startsWith(dir) && fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8') : null;
			};
			const file = scanPackage(spec, read, scan);
			scanned.set(spec, file);
			return file;
		}
		for (const namespace of fs.readdirSync(root))
			for (const name of fs.readdirSync(path.join(root, namespace)))
				for (const version of fs.readdirSync(path.join(root, namespace, name))) {
					const file = scan(`@${namespace}/${name}:${version}`);
					if (!file) continue;
					fs.mkdirSync(path.join(out, namespace, name), { recursive: true });
					fs.writeFileSync(path.join(out, namespace, name, `${version}.json`), JSON.stringify(file, null, '\t') + '\n');
				}
	},
	30 * 60 * 1000
);
