// the main document's rows: references across its files, and the spelling and grammar of each file
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import { editorConfigStore } from '$lib/stores/editorStore';
import { readSourceTrees } from '$lib/workspace/sourceTrees';
import { dirname, joinPath, samePath } from '$lib/workspace/fileSystem';
import { fileReferences, type FileReferences } from '../checks/fileReferences';
import { bibEntriesIn } from '../checks/bibEntries';
import { documentReferences, type DocumentBibs, type DocumentFile } from '../checks/documentReferences';
import { referenceProblems } from './referenceProblems';
import { proofreadProblems } from './proofreadProblems';
import type { MainDocument } from './mainDocument.svelte';
import type { Problem } from '../problemTypes';

/** null with no main file set */
export const projectProblems = box<{ main: string; problems: Problem[] } | null>(null);

export type ProjectCheckDeps = {
	document: () => MainDocument | null;
	open: () => string | null;
	root: () => string | null;
	read: (path: string) => Promise<string>;
	/** keys the folder's .bib and .bbl files hold */
	knownKeys: () => ReadonlySet<string>;
};

function isTex(path: string): boolean {
	return path.toLowerCase().endsWith('.tex');
}

function nextTask(): Promise<void> {
	return new Promise((next) => setTimeout(next));
}

export class ProjectChecks {
	private gen = 0;
	private soon = trailingDebounce<void>(1200, () => void this.run());
	private stopRules = onLintRulesChanged(() => {
		this.proofread.clear();
		this.soon();
	});
	private readings = new Map<string, { text: string; refs: FileReferences }>();
	private proofread = new Map<string, { text: string; problems: Problem[] }>();

	constructor(private deps: ProjectCheckDeps) {}

	schedule(): void {
		this.soon();
	}

	private async referencesOf(path: string, text: string): Promise<FileReferences> {
		const kept = this.readings.get(path);
		if (kept?.text === text) return kept.refs;
		await readSourceTrees(text);
		const refs = fileReferences(text);
		this.readings.set(path, { text, refs });
		return refs;
	}

	private async bibsOf(files: DocumentFile[], main: string, root: string, texts: Map<string, string>): Promise<DocumentBibs> {
		const entries: NonNullable<DocumentBibs>['entries'] = [];
		for (const f of files) {
			for (const b of f.refs.bibliographies) {
				if (b.remote) return null;
				let found: { path: string; text: string } | null = null;
				for (const dir of [dirname(main), dirname(f.path), root]) {
					const path = joinPath(dir, b.name);
					const text = await this.deps.read(path).catch(() => null);
					if (text !== null) {
						found = { path, text };
						break;
					}
				}
				if (!found) return null;
				if (entries.some((e) => samePath(e.path, found.path))) continue;
				texts.set(found.path, found.text);
				entries.push({ path: found.path, entries: bibEntriesIn(found.text) });
			}
		}
		return { entries };
	}

	private async run(): Promise<void> {
		const my = ++this.gen;
		const stale = () => my !== this.gen;
		const doc = this.deps.document();
		const root = this.deps.root();
		if (!doc || !root) {
			projectProblems.current = null;
			return;
		}
		const texts = new Map<string, string>();
		const files: DocumentFile[] = [];
		for (const path of doc.files) {
			const text = await this.deps.read(path).catch(() => null);
			if (stale()) return;
			if (text === null) continue;
			texts.set(path, text);
			if (!isTex(path)) continue;
			files.push({ path, refs: await this.referencesOf(path, text) });
			await nextTask();
			if (stale()) return;
		}
		const open = this.deps.open();
		let references: Problem[] = [];
		if (files.length) {
			const bibs = await this.bibsOf(files, doc.main, root, texts);
			if (stale()) return;
			// the open file's live checks already say these
			const findings = documentReferences(files, bibs, this.deps.knownKeys()).filter(
				(f) => !(open && samePath(f.file, open) && (f.kind === 'label-twice' || f.kind === 'cite-unknown'))
			);
			references = referenceProblems(findings, texts);
		}
		const others = doc.files.filter((p) => texts.has(p) && !(open && samePath(p, open)));
		const kept = this.proofread;
		const main = doc.main;
		function publish(): void {
			const proofread = others.flatMap((p) => kept.get(p)?.problems ?? []);
			projectProblems.current = { main, problems: [...references, ...proofread] };
		}
		const spellcheck = editorConfigStore.current?.spellcheck ?? false;
		if (!spellcheck) this.proofread.clear();
		publish();
		if (!spellcheck) return;
		for (const path of others) {
			const text = texts.get(path)!;
			if (this.proofread.get(path)?.text === text) continue;
			const found = await proofreadProblems(path, text, stale);
			if (stale()) return;
			this.proofread.set(path, { text, problems: found ?? [] });
			publish();
			await nextTask();
		}
	}

	destroy(): void {
		this.gen++;
		this.soon.cancel();
		this.stopRules();
		projectProblems.current = null;
	}
}
