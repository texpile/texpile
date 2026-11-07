// the names a Typst module binds at its top level, which are all it exports: its lets, and what its imports bring in,
// later ones winning as Typst reads them
import type { SyntaxNode } from '@lezer/common';
import { childrenOf, partsOf, strValue, textOf, typstTop } from './syntax';

export type ScopeBinding =
	/** `before`: what the name was bound to before this let, which `let x = x` reads */
	| { kind: 'let'; file: string; source: string; node: SyntaxNode; before?: ScopeBinding }
	| { kind: 'package'; spec: string; name: string }
	| { kind: 'module'; spec: string };

export type ModuleImport = { spec: string; items: Array<{ name: string; as: string }> | '*' | null; as: string | null };

/** reads a file of the package by its path from the package's root; null when it has none */
export type PackageFileReader = (path: string) => string | null;

/** `pathOf`: the path a let holds (`#let style = "color.typ"` then `#import style: *`) */
export function importOf(node: SyntaxNode, source: string, pathOf: (name: string) => string | null = () => null): ModuleImport | null {
	if (node.name !== 'ModuleImport') return null;
	const str = node.getChild('Str');
	const named = str ? null : node.getChild('Ident');
	const spec = str ? strValue(str, source) : named ? pathOf(textOf(named, source)) : null;
	if (spec === null) return null;
	const items = node.getChild('ImportItems');
	const alias = node.getChild('As') ? node.getChildren('Ident').slice(-1)[0] : null;
	return {
		spec,
		items: node.getChild('Star') ? '*' : items ? importedItems(items, source) : null,
		as: alias ? textOf(alias, source) : null
	};
}

/** a file's imports at its top level */
export function importsOf(top: SyntaxNode, source: string): ModuleImport[] {
	return childrenOf(top).flatMap((node) => importOf(node, source) ?? []);
}

function lastIdent(node: SyntaxNode, source: string): string | null {
	const ids = node.getChildren('Ident');
	return ids.length ? textOf(ids[ids.length - 1], source) : null;
}

function importedItems(items: SyntaxNode, source: string): Array<{ name: string; as: string }> {
	const out: Array<{ name: string; as: string }> = [];
	for (const c of childrenOf(items)) {
		if (c.name === 'ImportItemPath') {
			const name = lastIdent(c, source);
			if (name) out.push({ name, as: name });
		} else if (c.name === 'RenamedImportItem') {
			const path = c.getChild('ImportItemPath');
			const name = path && lastIdent(path, source);
			const as = lastIdent(c, source);
			if (name && as) out.push({ name, as });
		}
	}
	return out;
}

/** what a top-level let binds: a function's or a value's name, or the names a destructuring takes */
export function letNames(node: SyntaxNode, source: string): string[] {
	for (const c of partsOf(node)) {
		if (c.name === 'Closure') {
			const name = c.getChild('Ident');
			return name ? [textOf(name, source)] : [];
		}
		if (c.name === 'Ident') return [textOf(c, source)];
		if (c.name === 'Destructuring') return destructured(c, source);
	}
	return [];
}

function destructured(node: SyntaxNode, source: string): string[] {
	const out: string[] = [];
	for (const c of childrenOf(node)) {
		const bound = c.name === 'Ident' ? c : c.name === 'Named' || c.name === 'Spread' ? c.lastChild : null;
		if (bound?.name === 'Ident') out.push(textOf(bound, source));
		else if (bound?.name === 'Destructuring') out.push(...destructured(bound, source));
	}
	return out;
}

export function moduleNameOf(spec: string): string {
	const pkg = /^@[\w-]+\/([\w-]+):/.exec(spec);
	return pkg ? pkg[1] : (spec.split('/').pop() ?? spec).replace(/\.typ$/, '');
}

/** a path inside the package: `/x` from its root, anything else from the importing file's folder */
export function joinedPath(from: string, spec: string): string {
	const parts = spec.startsWith('/') ? [] : from.split('/').slice(0, -1);
	for (const part of spec.split('/')) {
		if (part === '..') parts.pop();
		else if (part && part !== '.') parts.push(part);
	}
	return parts.join('/');
}

export type ModuleScopes = {
	scopeOf(file: string): Map<string, ScopeBinding>;
};

/** the module scopes of one package's files, each read once */
export function moduleScopes(read: PackageFileReader, exportsOf: (spec: string) => Map<string, ScopeBinding> | null): ModuleScopes {
	const scopes = new Map<string, Map<string, ScopeBinding>>();
	function scopeOf(file: string): Map<string, ScopeBinding> {
		const known = scopes.get(file);
		if (known) return known;
		const names = new Map<string, ScopeBinding>();
		scopes.set(file, names);
		const source = read(file);
		if (source === null) return names;
		const top = typstTop(source);
		for (const node of childrenOf(top)) {
			if (node.name === 'LetBinding')
				for (const name of letNames(node, source)) names.set(name, { kind: 'let', file, source, node, before: names.get(name) });
			const imp = importOf(node, source);
			if (!imp) continue;
			const fromPackage = imp.spec.startsWith('@');
			const target = fromPackage ? exportsOf(imp.spec) : scopeOf(joinedPath(file, imp.spec));
			if (imp.items === null || imp.as)
				names.set(imp.as ?? moduleNameOf(imp.spec), { kind: 'module', spec: fromPackage ? imp.spec : joinedPath(file, imp.spec) });
			if (Array.isArray(imp.items))
				for (const item of imp.items) {
					const bound = target?.get(item.name) ?? (fromPackage ? { kind: 'package' as const, spec: imp.spec, name: item.name } : null);
					if (bound) names.set(item.as, bound);
				}
			if (imp.items === '*' && target) for (const [name, bound] of target) names.set(name, bound);
		}
		return names;
	}
	return { scopeOf };
}
