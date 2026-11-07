// whose a name in a Typst file is: a package's, the project's own let, or Typst's
import type { SyntaxNode } from '@lezer/common';
import { stdEntry } from './stdLibrary';
import { fieldOf, isMakerCall } from './scan/dictionaryFields';
import { importOf, joinedPath, letNames, moduleNameOf, type ModuleImport } from './scan/moduleScope';
import { letParts } from './scan/readEntry';
import { childrenOf, partsOf, strValue, textOf, typstTop } from './scan/syntax';
import { roleOf } from './callMeaning';
import type { TypstArgRole, TypstEntry, TypstPackageFile } from './types';

export type ScopedEntry = {
	entry: TypstEntry;
	/** `std`, or the package that defines it, `@preview/glossarium:0.5.10` */
	origin: string;
	/** the name is another name of the function its entry holds */
	aliased?: true;
};

/** a top-level let of the project, as its file wrote it; `scope` is the scope of that file, which its body reads */
export type OwnLet = {
	name: string;
	file: string;
	source: string;
	node: SyntaxNode;
	scope: TypstFileScope;
	/** the entry of the let's dictionary that the name reads (`info.title`), in place of the let's own value */
	value?: SyntaxNode;
	/** the name reads a field of what a maker's call made */
	madeField?: true;
};

/** the first argument of a call at the top of a file, with the file's text and scope that read it */
export type RoleCall = { argument: SyntaxNode; source: string; scope: TypstFileScope };

export type TypstFileScope = {
	/** a name, or a path through a module (`gls`, `g.gls`, `table.cell`) */
	lookup(path: string): ScopedEntry | null;
	/** the project's own let a name or a path through a local module reads */
	own(path: string): OwnLet | null;
	/** whether the file binds the name itself, by a let or an import */
	binds(path: string): boolean;
	/** the calls at the top of the file, and of the project files the scope follows, whose function takes an argument of
	 *  that role first (`register-glossary(entries)`) */
	callsWith(role: TypstArgRole): RoleCall[];
};

type PackageReader = (spec: string) => TypstPackageFile | null | undefined;

/** the project's files a scope may follow, by path from the project's root; null for one it does not hold */
export type ModuleReader = (path: string) => string | null;

type Statement = { lets: string[]; node: SyntaxNode } | { imp: ModuleImport };
/** own: null for a name the scope cannot tell the let of */
type Resolution = { found: ScopedEntry } | { own: OwnLet | null } | { module: Resolver };
type Resolver = (name: string) => Resolution | null;

const MOST_HOPS = 8;

/** a name of a package's, following its aliases, its re-exports and what it re-exports */
export function packageEntry(spec: string, name: string, read: PackageReader, hops = 0): ScopedEntry | null {
	const file = read(spec);
	if (!file || hops > MOST_HOPS) return null;
	const entry = Object.hasOwn(file.names, name) ? file.names[name] : null;
	if (entry?.alias) {
		const found = packageEntry(spec, entry.alias, read, hops + 1);
		// `thmplain = thmbox.with(..)` makes a function that prints otherwise than thmbox's
		return found && { ...found, aliased: true, entry: entry.makes ? { ...found.entry, makes: entry.makes } : found.entry };
	}
	if (entry?.from && entry.kind === 'unknown') return packageEntry(entry.from, name, read, hops + 1);
	if (entry) return { entry, origin: entry.from ?? spec };
	for (const [other, names] of Object.entries(file.reexports ?? {}))
		if (names === '*' || names.includes(name)) {
			const found = packageEntry(other, name, read, hops + 1);
			if (found) return found;
		}
	return null;
}

/** a file's top-level lets and imports, in the order Typst reads them */
export function statementsOf(top: SyntaxNode, source: string): Statement[] {
	const paths = new Map<string, string>();
	return childrenOf(top).flatMap((node): Statement[] => {
		if (node.name === 'LetBinding') {
			const lets = letNames(node, source);
			const value = node.lastChild;
			if (lets.length === 1 && value?.name === 'Str') paths.set(lets[0], strValue(value, source));
			return [{ lets, node }];
		}
		const imp = importOf(node, source, (name) => paths.get(name) ?? null);
		return imp ? [{ imp }] : [];
	});
}

/** the local modules a file imports, as paths from the project's root */
export function localImports(source: string, path: string): string[] {
	return statementsOf(typstTop(source), source).flatMap((s) =>
		'imp' in s && !s.imp.spec.startsWith('@') ? [joinedPath(path, s.imp.spec)] : []
	);
}

/** the files a file includes at its top level, as paths from the project's root */
export function localIncludes(source: string, path: string): string[] {
	return childrenOf(typstTop(source)).flatMap((node) => {
		const str = node.name === 'ModuleInclude' ? node.getChild('Str') : null;
		return str ? [joinedPath(path, strValue(str, source))] : [];
	});
}

const ARGUMENT_PUNCTUATION = new Set(['LeftParen', 'RightParen', 'Comma', 'Named', 'Spread']);

function topCallsWith(text: string, scope: TypstFileScope, role: TypstArgRole): RoleCall[] {
	const out: RoleCall[] = [];
	for (const node of childrenOf(typstTop(text))) {
		const [callee, args] = node.name === 'FuncCall' ? partsOf(node) : [];
		if (!args || (callee.name !== 'Ident' && callee.name !== 'FieldAccess')) continue;
		const entry = scope.lookup(textOf(callee, text))?.entry;
		const argument = partsOf(args).find((part) => !ARGUMENT_PUNCTUATION.has(part.name));
		if (entry && argument && roleOf(entry, { index: 0 }) === role) out.push({ argument, source: text, scope });
	}
	return out;
}

function scopeOfResolver(top: Resolver, callsWith: (role: TypstArgRole) => RoleCall[]): TypstFileScope {
	/** undefined: the file binds no such name */
	function resolve(dotted: string): Resolution | null | undefined {
		const [head, ...rest] = dotted.split('.');
		let at = top(head);
		if (!at) return undefined;
		for (const part of rest) {
			if ('module' in at) at = at.module(part);
			else if ('found' in at) {
				const inner: TypstEntry | undefined =
					at.found.entry.scope && Object.hasOwn(at.found.entry.scope, part) ? at.found.entry.scope[part] : undefined;
				at = inner ? { found: { entry: inner, origin: at.found.origin } } : null;
			} else if (at.own) {
				const field = fieldOf(at.own, part);
				at = field ? { own: field } : null;
			} else return null;
			if (!at) return null;
		}
		return at;
	}
	function lookup(dotted: string): ScopedEntry | null {
		const at = resolve(dotted);
		if (at !== undefined) return at && 'found' in at ? at.found : null;
		const std = stdEntry(dotted);
		return std ? { entry: std, origin: 'std' } : null;
	}
	function own(dotted: string): OwnLet | null {
		const at = resolve(dotted);
		return at && 'own' in at ? at.own : null;
	}
	return { lookup, own, binds: (path) => resolve(path) !== undefined, callsWith };
}

/** `path` is the file's own, from the project's root, which its local imports are read against */
export function typstFileScope(source: string, read: PackageReader, path = '', modules: ModuleReader = () => null): TypstFileScope {
	const resolvers = new Map<string, Resolver>();

	function packageModule(spec: string): Resolver {
		return (name) => {
			const found = packageEntry(spec, name, read);
			return found ? { found } : null;
		};
	}

	function moduleScope(text: string, file: string, depth: number): { resolver: Resolver; scope: TypstFileScope } {
		const statements = statementsOf(typstTop(text), text).reverse();
		function local(spec: string): Resolver {
			const at = joinedPath(file, spec);
			const known = resolvers.get(at);
			if (known) return known;
			const inner = modules(at);
			const resolver = inner !== null && depth < MOST_HOPS ? moduleScope(inner, at, depth + 1).resolver : () => null;
			resolvers.set(at, resolver);
			return resolver;
		}
		function letsOf(name: string): number {
			return statements.filter((s) => 'lets' in s && s.lets.includes(name)).length;
		}
		function madeTwice(name: string): Resolution {
			const nodes = statements.flatMap((s) => ('lets' in s && s.lets.includes(name) ? [s.node] : []));
			const made = nodes.every((node) => {
				const { params, body } = letParts(node, text);
				return !params && isMakerCall(body, text, scope);
			});
			return { own: made ? { name, file, source: text, node: nodes[0], scope } : null };
		}
		function resolver(name: string): Resolution | null {
			// the open file reads a name it lets twice by where it is used, which a scope of the whole file cannot tell
			// except a maker called again, which draws the same from either let
			if (depth === 0 && letsOf(name) > 1) return madeTwice(name);
			for (const statement of statements) {
				if ('lets' in statement) {
					if (statement.lets.includes(name)) return { own: { name, file, source: text, node: statement.node, scope } };
					continue;
				}
				const { imp } = statement;
				const target = imp.spec.startsWith('@') ? packageModule(imp.spec) : local(imp.spec);
				if ((imp.items === null || imp.as) && (imp.as ?? moduleNameOf(imp.spec)) === name) return { module: target };
				const item = Array.isArray(imp.items) ? imp.items.find((i) => i.as === name) : null;
				if (item) return target(item.name) ?? (imp.spec.startsWith('@') ? null : { own: null });
				if (imp.items === '*') {
					const found = target(name);
					if (found) return found;
				}
			}
			return null;
		}
		const calls = new Map<TypstArgRole, RoleCall[]>();
		const scope: TypstFileScope = scopeOfResolver(resolver, (role) => {
			if (!calls.has(role)) calls.set(role, topCallsWith(text, scope, role));
			return calls.get(role)!;
		});
		return { resolver, scope };
	}

	return moduleScope(source, path, 0).scope;
}
