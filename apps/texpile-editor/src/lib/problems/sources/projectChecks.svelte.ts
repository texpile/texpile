// the main document's rows: references across its files, and the spelling and grammar of each file
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { onLintRulesChanged } from '$lib/editor/spellcheck/linter';
import { editorConfigStore } from '$lib/stores/editorStore';
import { readSourceTrees } from '$lib/workspace/sourceTrees';
import { dirname, joinPath, samePath } from '$lib/workspace/fileSystem';
import { fileReferences, type FileReferences } from '../checks/fileReferences';
import { fileNotes } from '../checks/fileNotes';
import { documentTermReadings } from '../checks/documentTermReadings';
import type { CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { noteProblems } from './noteProblems';
import { bibEntriesIn } from '../checks/bibEntries';
import { documentReferences, type DocumentBibs, type DocumentFile } from '../checks/documentReferences';
import { referenceProblems } from './referenceProblems';
import { proofreadProblems } from './proofreadProblems';
import { documentTermProblems } from './termProblems';
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
	private readings = new Map<string, { text: string; own: CommandReadings | null; refs: FileReferences; notes: Problem[] }>();
	private proofread = new Map<string, { text: string; problems: Problem[] }>();

	constructor(private deps: ProjectCheckDeps) {}

	schedule(): void {
		this.soon();
	}

	private async readingOf(path: string, text: string, own: CommandReadings | null): Promise<{ refs: FileReferences; notes: Problem[] }> {
		const kept = this.readings.get(path);
		if (kept?.text === text && kept.own === own) return kept;
		await readSourceTrees(text);
		const reading = { text, own, refs: fileReferences(text, own), notes: noteProblems(path, text, fileNotes(text)) };
		this.readings.set(path, reading);
		return reading;
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
			if (text !== null) texts.set(path, text);
		}
		const tex = doc.files.filter((p) => isTex(p) && texts.has(p));
		const own = await documentTermReadings(tex.map((path) => ({ path, text: texts.get(path)! })));
		if (stale()) return;
		for (const path of tex) {
			const reading = await this.readingOf(path, texts.get(path)!, own);
			files.push({ path, refs: reading.refs });
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
		const terms = await documentTermProblems(doc.files, texts, stale);
		if (terms === null) return;
		references.push(...terms);
		const others = doc.files.filter((p) => texts.has(p) && !(open && samePath(p, open)));
		const kept = this.proofread;
		const readings = this.readings;
		const main = doc.main;
		function publish(): void {
			const own = others.flatMap((p) => [...(readings.get(p)?.notes ?? []), ...(kept.get(p)?.problems ?? [])]);
			projectProblems.current = { main, problems: [...references, ...own] };
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
