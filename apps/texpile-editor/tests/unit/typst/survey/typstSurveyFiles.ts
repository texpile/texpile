// what each .typ file of a paper is: a slide deck (it, or a file it imports, imports a package Typst Universe files under
// presentation; or only decks include it), a module (only ever imported, so it holds definitions), or the paper's content
import fs from 'node:fs';
import path from 'node:path';
import { typstTree } from './typstSurveyHeads';
import { packageDir } from './typstSurveyOrigins';

export type FileRole = 'content' | 'module' | 'slides';

type FileLinks = { imports: string[]; includes: string[]; deck: boolean };

function isPresentationPackage(packages: string, spec: string): boolean {
	const dir = packageDir(packages, spec);
	const manifest = dir && path.join(dir, 'typst.toml');
	if (!manifest || !fs.existsSync(manifest)) return false;
	const categories = /^categories\s*=\s*\[([^\]]*)\]/m.exec(fs.readFileSync(manifest, 'utf8'))?.[1] ?? '';
	return /"presentation"/.test(categories);
}

function linksOf(file: string, root: string, packages: string): FileLinks {
	const source = fs.readFileSync(file, 'utf8');
	const links: FileLinks = { imports: [], includes: [], deck: false };
	typstTree(source).iterate({
		enter: (n) => {
			if (n.name !== 'ModuleImport' && n.name !== 'ModuleInclude') return;
			const str = n.node.getChild('Str');
			if (!str) return;
			const spec = source.slice(str.from + 1, str.to - 1);
			if (spec.startsWith('@')) {
				if (isPresentationPackage(packages, spec)) links.deck = true;
				return;
			}
			const target = spec.startsWith('/') ? path.join(root, spec) : path.join(path.dirname(file), spec);
			(n.name === 'ModuleImport' ? links.imports : links.includes).push(path.normalize(target));
		}
	});
	return links;
}

export function fileRoles(root: string, files: string[], packages: string): Map<string, FileRole> {
	const links = new Map(files.map((file) => [path.normalize(file), linksOf(file, root, packages)]));
	const decks = new Map<string, boolean>();
	const reachesDeck = (file: string): boolean => {
		const known = decks.get(file);
		if (known !== undefined) return known;
		decks.set(file, false);
		const own = links.get(file);
		const deck = !!own && (own.deck || own.imports.some(reachesDeck));
		decks.set(file, deck);
		return deck;
	};
	const slides = new Set(files.map((file) => path.normalize(file)).filter(reachesDeck));
	const includers = new Map<string, string[]>();
	for (const [file, l] of links) for (const target of l.includes) includers.set(target, [...(includers.get(target) ?? []), file]);
	for (let grew = true; grew;) {
		grew = false;
		for (const [target, from] of includers) {
			if (slides.has(target) || !links.has(target) || !from.every((file) => slides.has(file))) continue;
			slides.add(target);
			grew = true;
		}
	}
	const imported = new Set([...links.values()].flatMap((l) => l.imports));
	const included = new Set([...links.values()].flatMap((l) => l.includes));
	const roles = new Map<string, FileRole>();
	for (const file of files) {
		const key = path.normalize(file);
		roles.set(file, slides.has(key) ? 'slides' : imported.has(key) && !included.has(key) ? 'module' : 'content');
	}
	return roles;
}
