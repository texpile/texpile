import type { SyntaxNode } from '@lezer/common';
import { STD_MODULE } from '../stdLibrary';
import type { TypstEntry, TypstPackageFile, TypstParam } from '../types';
import { blockReader, type BlockReading } from './blockReading';
import { moduleScopes, type PackageFileReader, type ScopeBinding } from './moduleScope';
import { entryOf, letParts, paramsOf, valueText } from './readEntry';
import { entryAt, type ResolvedName } from './scanNames';
import { argumentRoles, type OwnRole } from './paramUse';
import { setDocumentParts } from './paramParts';
import { setParamSinks } from './paramSinks';
import { partsOf, textOf } from './syntax';

type LetBinding = ScopeBinding & { kind: 'let' };

export function scanPackage(id: string, read: PackageFileReader, other: (spec: string) => TypstPackageFile | null): TypstPackageFile {
	const manifest = read('typst.toml') ?? '';
	const entrypoint = (/^\s*entrypoint\s*=\s*"([^"]+)"/m.exec(manifest)?.[1] ?? 'lib.typ').replace(/^\.?\//, '');
	function otherExports(spec: string): Map<string, ScopeBinding> | null {
		const file = other(spec);
		return file ? new Map(Object.keys(file.names).map((name) => [name, { kind: 'package', spec, name }])) : null;
	}
	const scopes = moduleScopes(read, otherExports);
	const readings = new Map<SyntaxNode, BlockReading | 'reading'>();
	const entries = new Map<SyntaxNode, TypstEntry>();
	const aliasing = new Set<SyntaxNode>();
	const readingRoles = new Set<SyntaxNode>();

	function resolverFor(binding: LetBinding, params: TypstParam[]): (name: string) => ResolvedName {
		const scope = scopes.scopeOf(binding.file);
		return (name) => {
			if (params.some((p) => p.name === name)) return { kind: 'param', name };
			const bound = scope.get(name);
			if (bound?.kind === 'let') return { kind: 'own', binding: bound };
			if (bound?.kind === 'package') {
				const entry = other(bound.spec)?.names[bound.name];
				return entry ? { kind: 'std', entry } : null;
			}
			if (bound) return null;
			const std = entryAt(STD_MODULE, [name]);
			return std ? { kind: 'std', entry: std } : null;
		};
	}

	function readingOf(binding: LetBinding): BlockReading {
		const known = readings.get(binding.node);
		if (known === 'reading') return null;
		if (known !== undefined) return known;
		readings.set(binding.node, 'reading');
		const parts = letParts(binding.node, binding.source);
		const params = parts.params ? paramsOf(parts.params, binding.source) : [];
		const scope = scopes.scopeOf(binding.file);
		const reader = blockReader(binding.source, resolverFor(binding, params), (name) => {
			const bound = scope.get(name);
			return bound?.kind === 'let' ? { reading: () => readingOf(bound) } : null;
		});
		const reading = parts.body ? reader.read(parts.body) : null;
		readings.set(binding.node, reading);
		return reading;
	}

	function entryOfLet(binding: LetBinding): TypstEntry {
		const known = entries.get(binding.node);
		if (known) return known;
		const { source, node } = binding;
		const parts = letParts(node, source);
		const resolve = resolverFor(binding, []);
		const same = parts.aliasOf ?? (!parts.params && parts.body ? withBase(parts.body, source) : null);
		if (same && !aliasing.has(node)) {
			aliasing.add(node);
			const entry = sameAs(same, node, resolve);
			aliasing.delete(node);
			if (entry) return remember(node, entry);
			if (!parts.aliasOf) return remember(node, { kind: 'function' });
		}
		const params = parts.params ? paramsOf(parts.params, source) : null;
		if (params && parts.body && !readingRoles.has(node)) {
			readingRoles.add(node);
			for (const [name, role] of argumentRoles(parts.body, source, params, ownRole(resolve))) withRole(params, name, role);
			setDocumentParts(params, parts.body, source, (name) => name === 'document' && resolve(name)?.kind === 'std');
			setParamSinks(params, parts.body, source, resolve);
			readingRoles.delete(node);
		}
		function wraps(name: string): boolean {
			const found = resolve(name);
			return found?.kind === 'std' && found.entry.block === 'content';
		}
		const prints = !params && parts.body ? (valueText(parts.body, source, wraps) ?? printsNothing(parts.body, source, resolve)) : null;
		const value = !params && parts.body && readsOnlyStd(parts.body, source, resolve) ? textOf(parts.body, source) : null;
		return remember(node, entryOf(params, readingOf(binding), prints, value));
	}

	function sameAs(name: string, node: SyntaxNode, resolve: (name: string) => ResolvedName): TypstEntry | null {
		let target = resolve(name);
		if (target?.kind === 'own' && target.binding.node === node) target = bindingName(target.binding.before, name);
		if (target?.kind === 'std') return target.entry;
		if (target?.kind !== 'own' || target.binding.node === node) return null;
		const exported = scopes.scopeOf(entrypoint).get(name);
		const entry = entryOfLet(target.binding);
		const same =
			exported?.kind === 'let' && exported.node !== node && (exported.node === target.binding.node || entryOfLet(exported) === entry);
		return same ? { kind: entry.kind, alias: name } : entry;
	}

	function ownRole(resolve: (name: string) => ResolvedName): OwnRole {
		return (name, place) => {
			const target = resolve(name);
			if (target?.kind !== 'own' || readingRoles.has(target.binding.node)) return null;
			const params = entryOfLet(target.binding).params ?? [];
			const param =
				'name' in place ? params.find((p) => p.named && p.name === place.name) : params.filter((p) => p.positional)[place.index];
			return param?.role ?? null;
		};
	}

	function remember(node: SyntaxNode, entry: TypstEntry): TypstEntry {
		entries.set(node, entry);
		return entry;
	}

	const names: Record<string, TypstEntry> = {};
	const reexported = new Map<string, string[]>();
	for (const [name, bound] of scopes.scopeOf(entrypoint)) {
		if (bound.kind === 'let') names[name] = entryOfLet(bound);
		else if (bound.kind === 'module') names[name] = bound.spec.startsWith('@') ? { kind: 'module', from: bound.spec } : { kind: 'module' };
		else if (bound.name === name) reexported.set(bound.spec, [...(reexported.get(bound.spec) ?? []), name]);
		else names[name] = { ...(other(bound.spec)?.names[bound.name] ?? { kind: 'unknown' }), from: bound.spec };
	}
	const file: TypstPackageFile = { version: 1, id, names };
	if (reexported.size)
		file.reexports = Object.fromEntries(
			[...reexported].map(([spec, list]) => [spec, list.length === Object.keys(other(spec)?.names ?? {}).length ? '*' : list.sort()])
		);
	return file;
}

function bindingName(bound: ScopeBinding | undefined, name: string): ResolvedName {
	if (bound?.kind === 'let') return { kind: 'own', binding: bound };
	if (bound) return null;
	const std = entryAt(STD_MODULE, [name]);
	return std ? { kind: 'std', entry: std } : null;
}

function withBase(node: SyntaxNode, source: string): string | null {
	if (node.name !== 'FuncCall') return null;
	const callee = node.firstChild;
	if (callee?.name !== 'FieldAccess' || callee.lastChild?.name !== 'Ident' || textOf(callee.lastChild, source) !== 'with') return null;
	return callee.firstChild?.name === 'Ident' ? textOf(callee.firstChild, source) : null;
}

function withRole(params: TypstParam[], name: string, role: NonNullable<TypstParam['role']>): void {
	const param = params.find((p) => p.name === name);
	if (!param) return;
	if (role === 'text') param.content = true;
	param.role ??= role;
}

function printsNothing(node: SyntaxNode, source: string, resolve: (name: string) => ResolvedName): string | null {
	if (node.name === 'CodeBlock') {
		const last = partsOf(node.getChild('Code') ?? node).pop();
		return last ? printsNothing(last, source, resolve) : '';
	}
	const callee = node.name === 'FuncCall' ? node.firstChild : null;
	if (callee?.name === 'FieldAccess') return callee.lastChild && textOf(callee.lastChild, source) === 'update' ? '' : null;
	if (callee?.name !== 'Ident') return null;
	const found = resolve(textOf(callee, source));
	return found?.kind === 'std' && found.entry.prints === '' ? '' : null;
}

const LONGEST_VALUE = 160;

function readsOnlyStd(node: SyntaxNode, source: string, resolve: (name: string) => ResolvedName): boolean {
	if (node.to - node.from > LONGEST_VALUE) return false;
	let only = true;
	node.cursor().iterate((n) => {
		if (!only) return false;
		if (n.name === 'Ident' && n.node.parent?.name !== 'Named' && n.node.parent?.name !== 'FieldAccess') {
			if (resolve(textOf(n.node, source))?.kind !== 'std') only = false;
		}
		if (n.name === 'FieldAccess' && n.node.firstChild?.name === 'Ident') {
			if (resolve(textOf(n.node.firstChild, source))?.kind !== 'std') only = false;
			return false;
		}
		return true;
	});
	return only;
}
