// label completion in any argument the data or a wrapper the project defines gives a label: labelStore (the active
// buffer's labels), the label= key of a call whose package gives it the label role, labels from every other project file (projectIntel),
// and resolved numbers from the main .aux when one exists
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { labelStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import type { Text } from '@codemirror/state';
import { lastListToken } from './shared';
import { keyLabelsIn } from '$lib/languages/latex/knowledge/calls/keyLabels';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { documentPackages } from '../packages/loadedPackages';
import { withoutComments } from '../packages/packageUses';
import { argumentAt, commonCommand, type CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { ownReadingsIn, type ProjectDefinition } from '$lib/languages/latex/userDefinitions';
import { codeOnly } from '$lib/languages/latex/texCode';

const READ_BEHIND = 2000;

/** labelStore plus the labels the buffer's keys define (listings' label=). */
export function allLabels(bufferText: string, loaded: LoadedFile[]): string[] {
	const fromStore = labelStore.current ?? [];
	const fromKeys = keyLabelsIn(withoutComments(bufferText), loaded);
	return fromKeys.length ? [...new Set([...fromStore, ...fromKeys])] : fromStore;
}

// the open argument of a command the data does not know: \figref{fig:
const UNKNOWN_OPEN = /\\([A-Za-z@]+)\*?(?:\s*(?:\[[^\]]*\]|\{[^{}]*\}))*\s*[{[][^{}[\]]*$/;

const readingsByDoc = new WeakMap<Text, { macros: readonly ProjectDefinition[]; readings: CommandReadings }>();

function ownReadingsOf(doc: Text, macros: readonly ProjectDefinition[]): CommandReadings {
	let cached = readingsByDoc.get(doc);
	if (cached?.macros !== macros) {
		cached = { macros, readings: ownReadingsIn(codeOnly(doc.toString()), macros) };
		readingsByDoc.set(doc, cached);
	}
	return cached.readings;
}

export async function referenceCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
	const intel = projectIntelStore.current;
	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - READ_BEHIND), ctx.pos);
	let open = argumentAt(behind, ['label']);
	const unknown = UNKNOWN_OPEN.exec(behind)?.[1];
	if (!open && unknown && !commonCommand(unknown)) open = argumentAt(behind, ['label'], ownReadingsOf(ctx.state.doc, intel.macros));
	if (!open || open.arg.arg.defines) return null;
	const ref = { from: ctx.pos - behind.length + open.value.at, text: open.value.value };
	function basename(p: string) {
		return p.replace(/\\/g, '/').split('/').pop() ?? p;
	}
	function detailOf(name: string, from?: string): string | undefined {
		const num = intel.auxNumbers[name];
		const page = intel.auxPages[name];
		const resolved = num ? `${num}${page ? `, p.${page}` : ''}` : '';
		return [resolved, from].filter(Boolean).join(' · ') || undefined;
	}
	const text = ctx.state.doc.toString();
	const loaded = await documentPackages(text);
	const seen = new Set<string>();
	const options: Completion[] = [];
	for (const l of allLabels(text, loaded)) {
		seen.add(l);
		options.push({ label: l, type: 'variable', detail: detailOf(l) });
	}
	for (const l of intel.labels) {
		if (seen.has(l.name)) continue;
		seen.add(l.name);
		options.push({ label: l.name, type: 'variable', detail: detailOf(l.name, basename(l.file)) });
	}
	if (!options.length) return null;
	return lastListToken(ref, options);
}
