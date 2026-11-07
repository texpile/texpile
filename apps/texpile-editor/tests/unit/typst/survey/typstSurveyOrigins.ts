// whose a name is in a paper: its own (#let in one of its files, or a module of its own), a package's (imported from
// @preview), or Typst's. Packages are read from a folder laid out as Typst's package cache: <root>/<namespace>/<name>/<version>
import fs from 'node:fs';
import path from 'node:path';
import type { SyntaxNode } from '@lezer/common';
import { typstTree } from './typstSurveyHeads';
import { TYPST_GLOBALS } from './typstGlobals';

export type NameOrigin = 'own' | `package ${string}` | 'typst' | 'unresolved';

export type PaperNames = {
	origin(name: string | null): NameOrigin | null;
	/** the @preview imports the paper names that the package folder does not hold */
	missingPackages: Set<string>;
};

export function listTyp(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listTyp(full));
		else if (entry.isFile() && entry.name.endsWith('.typ')) out.push(full);
	}
	return out;
}

/** the names a file's top level binds with let, which is all a module exports: a let inside a block or a function is local */
function letNames(source: string): string[] {
	const out: string[] = [];
	for (let n = typstTree(source).topNode.firstChild; n; n = n.nextSibling) {
		if (n.name !== 'LetBinding') continue;
		for (let c = n.firstChild; c; c = c.nextSibling) {
			const named = c.name === 'Closure' ? c.getChild('Ident') : c.name === 'Ident' ? c : null;
			if (named) out.push(source.slice(named.from, named.to));
			if (c.name === 'Destructuring') out.push(...destructured(c, source));
			if (c.name === 'Closure' || c.name === 'Ident' || c.name === 'Destructuring') break;
		}
	}
	return out;
}

/** `(a, b: c, ..rest)` binds a, c and rest */
function destructured(node: SyntaxNode, source: string): string[] {
	const out: string[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) {
		const bound = c.name === 'Ident' ? c : c.name === 'Named' || c.name === 'Spread' ? c.lastChild : null;
		if (bound?.name === 'Ident') out.push(source.slice(bound.from, bound.to));
		else if (bound?.name === 'Destructuring') out.push(...destructured(bound, source));
	}
	return out;
}

export type Import = { spec: string; items: string[] | '*' | null; as: string | null };

/** a file's imports; `topOnly` keeps the ones at its top level, which are all a module re-exports */
export function importsOf(source: string, topOnly = false): Import[] {
	const out: Import[] = [];
	const top = typstTree(source).topNode;
	const nodes: SyntaxNode[] = [];
	if (topOnly) for (let c = top.firstChild; c; c = c.nextSibling) nodes.push(c);
	else top.cursor().iterate((n) => void nodes.push(n.node));
	for (const node of nodes) {
		if (node.name !== 'ModuleImport') continue;
		const str = node.getChild('Str');
		if (!str) continue;
		const items = node.getChild('ImportItems');
		const alias = node.getChild('As') ? node.getChildren('Ident').slice(-1)[0] : null;
		out.push({
			spec: source.slice(str.from + 1, str.to - 1),
			items: node.getChild('Star') ? '*' : items ? importedNames(items, source) : null,
			as: alias ? source.slice(alias.from, alias.to) : null
		});
	}
	return out;
}

function importedNames(items: SyntaxNode, source: string): string[] {
	const out: string[] = [];
	for (let c = items.firstChild; c; c = c.nextSibling) {
		if (c.name === 'RenamedImportItem') {
			const ids = c.getChildren('Ident');
			if (ids.length) out.push(source.slice(ids[ids.length - 1].from, ids[ids.length - 1].to));
		} else if (c.name === 'ImportItemPath') {
			const ids = c.getChildren('Ident');
			if (ids.length) out.push(source.slice(ids[ids.length - 1].from, ids[ids.length - 1].to));
		}
	}
	return out;
}

const packageExports = new Map<string, Map<string, string>>();
const moduleScopes = new Map<string, Map<string, string>>();
const absent = new Set<string>();

export function packageDir(packages: string, spec: string): string | null {
	const m = /^@([\w-]+)\/([\w-]+):([\w.-]+)$/.exec(spec);
	const dir = m ? path.join(packages, m[1], m[2], m[3]) : '';
	return m && fs.existsSync(dir) ? dir : null;
}

/** what a `*` import of a package brings in, with the package each name comes from: the top level of its entrypoint and
 *  what that re-exports */
function exportsOf(packages: string, spec: string): Map<string, string> {
	const known = packageExports.get(spec);
	if (known) return known;
	const dir = packageDir(packages, spec);
	if (!dir) {
		absent.add(spec);
		packageExports.set(spec, new Map());
		return packageExports.get(spec)!;
	}
	const manifest = path.join(dir, 'typst.toml');
	const entry = fs.existsSync(manifest) ? /entrypoint\s*=\s*"([^"]+)"/.exec(fs.readFileSync(manifest, 'utf8'))?.[1] : null;
	const names = moduleScope(path.join(dir, entry ?? 'lib.typ'), dir, moduleName(spec), packages);
	packageExports.set(spec, names);
	return names;
}

function moduleScope(file: string, root: string, pkg: string, packages: string): Map<string, string> {
	const known = moduleScopes.get(file);
	if (known) return known;
	const names = new Map<string, string>();
	moduleScopes.set(file, names);
	if (!fs.existsSync(file)) return names;
	const source = fs.readFileSync(file, 'utf8');
	for (const name of letNames(source)) names.set(name, pkg);
	for (const imp of importsOf(source, true)) {
		const fromPackage = imp.spec.startsWith('@');
		const target = fromPackage
			? exportsOf(packages, imp.spec)
			: moduleScope(imp.spec.startsWith('/') ? path.join(root, imp.spec) : path.join(path.dirname(file), imp.spec), root, pkg, packages);
		const from = fromPackage ? moduleName(imp.spec) : pkg;
		if (imp.items === null || imp.as) names.set(imp.as ?? moduleName(imp.spec), from);
		if (Array.isArray(imp.items)) for (const name of imp.items) names.set(name, target.get(name) ?? from);
		if (imp.items === '*') for (const [name, whose] of target) if (!names.has(name)) names.set(name, whose);
	}
	return names;
}

function moduleName(spec: string): string {
	const pkg = /^@[\w-]+\/([\w-]+):/.exec(spec);
	return pkg ? pkg[1] : path.basename(spec).replace(/\.typ$/, '');
}

export function paperNames(files: string[], packages: string): PaperNames {
	const own = new Set<string>();
	const imported = new Map<string, NameOrigin>();
	const starred: Array<Map<string, string>> = [];
	const missingPackages = new Set<string>();
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		for (const name of letNames(source)) own.add(name);
		for (const imp of importsOf(source)) {
			if (!imp.spec.startsWith('@')) {
				if (imp.items === null || imp.as) imported.set(imp.as ?? moduleName(imp.spec), 'own');
				if (Array.isArray(imp.items)) for (const name of imp.items) imported.set(name, 'own');
				continue;
			}
			const exports = exportsOf(packages, imp.spec);
			if (absent.has(imp.spec)) missingPackages.add(imp.spec);
			const pkg = moduleName(imp.spec);
			if (imp.items === null || imp.as) imported.set(imp.as ?? pkg, `package ${pkg}`);
			if (Array.isArray(imp.items)) for (const name of imp.items) imported.set(name, `package ${exports.get(name) ?? pkg}`);
			if (imp.items === '*') starred.push(exports);
		}
	}
	return {
		missingPackages,
		origin(name) {
			if (!name) return null;
			const explicit = imported.get(name);
			if (explicit) return explicit;
			if (own.has(name)) return 'own';
			const from = starred.find((names) => names.has(name))?.get(name);
			if (from) return `package ${from}`;
			return TYPST_GLOBALS.has(name) ? 'typst' : 'unresolved';
		}
	};
}
