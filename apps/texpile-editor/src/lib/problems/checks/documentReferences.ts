// labels, references and citations checked across every file of the main document
import type { FileReferences, KeyAt } from './fileReferences';

export type ReferenceKind = 'ref-undefined' | 'label-twice' | 'cite-unknown' | 'entry-uncited' | 'float-unreferenced';

/** elsewhere: for label-twice, another file that defines it, null when the same file does twice */
export type ReferenceFinding = { kind: ReferenceKind; file: string; at: number; name: string; elsewhere?: string | null };

export type DocumentFile = { path: string; refs: FileReferences };

/** entries: what each .bib the document names holds; null when one could not be read */
export type DocumentBibs = { entries: { path: string; entries: KeyAt[] }[] } | null;

function keysOf(files: DocumentFile[], pick: (r: FileReferences) => KeyAt[]): Set<string> {
	return new Set(files.flatMap((f) => pick(f.refs).map((k) => k.key)));
}

export function documentReferences(files: DocumentFile[], bibs: DocumentBibs, knownKeys: ReadonlySet<string>): ReferenceFinding[] {
	const out: ReferenceFinding[] = [];
	const definers = new Map<string, string[]>();
	for (const f of files) for (const l of f.refs.labels) definers.set(l.key, [...(definers.get(l.key) ?? []), f.path]);
	for (const f of files) {
		for (const l of f.refs.labels) {
			const all = definers.get(l.key)!;
			if (all.length < 2) continue;
			out.push({ kind: 'label-twice', file: f.path, at: l.at, name: l.key, elsewhere: all.find((p) => p !== f.path) ?? null });
		}
	}

	function any(pick: (r: FileReferences) => boolean): boolean {
		return files.some((f) => pick(f.refs));
	}
	if (!any((r) => r.unsure.labels || r.external)) {
		for (const f of files)
			for (const r of f.refs.refs) if (!definers.has(r.key)) out.push({ kind: 'ref-undefined', file: f.path, at: r.at, name: r.key });
	}
	if (!any((r) => r.unsure.refs)) {
		const used = keysOf(files, (r) => r.refs);
		for (const f of files)
			for (const l of f.refs.floatLabels)
				if (!used.has(l.key)) out.push({ kind: 'float-unreferenced', file: f.path, at: l.at, name: l.key });
	}

	const items = keysOf(files, (r) => r.items);
	const hasBibliography = items.size > 0 || any((r) => r.bibliographies.length > 0);
	if (bibs && hasBibliography) {
		const known = new Set([...items, ...knownKeys, ...bibs.entries.flatMap((b) => b.entries.map((e) => e.key))]);
		for (const f of files)
			for (const c of f.refs.cites) if (!known.has(c.key)) out.push({ kind: 'cite-unknown', file: f.path, at: c.at, name: c.key });
		if (!any((r) => r.unsure.cites)) {
			const cited = keysOf(files, (r) => r.cites);
			for (const b of bibs.entries)
				for (const e of b.entries) if (!cited.has(e.key)) out.push({ kind: 'entry-uncited', file: b.path, at: e.at, name: e.key });
			for (const f of files)
				for (const i of f.refs.items) if (!cited.has(i.key)) out.push({ kind: 'entry-uncited', file: f.path, at: i.at, name: i.key });
		}
	}
	return out;
}
