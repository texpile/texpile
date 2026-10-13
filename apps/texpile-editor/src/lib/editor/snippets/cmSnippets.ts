import {
	autocompletion,
	completionStatus,
	startCompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';
import { Compartment, EditorState, Facet, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin, type EditorView as CMView } from '@codemirror/view';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { usesSelection } from './expand/body/bodyNodes';
import { cutsThroughSyntax } from './expand/selectionCuts';
import { choiceCompletionSource, choiceFieldAt, choiceFields } from './expand/choiceFields';
import { expandSnippet, type SnippetSpot } from './expand/expandSnippet';
import { snippetSession } from './expand/snippetSession';
import { autoMatches, popupCandidates, type CompiledSnippet } from './expand/matchSnippets';
import { contextAllows, snippetZoneAt } from './expand/snippetZone';
import { onSnippetRegistry, snippetRegistry } from './file/snippetRegistry';
import { mathKeys } from './math/mathKeys';
import type { SnippetLanguage } from './file/snippetTypes';

const snippetLanguage = Facet.define<SnippetLanguage, SnippetLanguage | null>({ combine: (v) => v[0] ?? null });
const undoStop = Facet.define<() => void, () => void>({ combine: (v) => v[0] ?? (() => {}) });

function languageOf(state: EditorState): SnippetLanguage | null {
	return state.facet(snippetLanguage);
}

// the body as it will read: places as their defaults or …, and \\ \$ \} as the characters they escape
function previewOf(body: string): string {
	return body
		.split('\n')[0]
		.replace(/\\([\\$}])|\$\{\d+(?::([^}]*))?\}|\$\d+/g, (_, escaped: string | undefined, d: string | undefined) => escaped ?? d ?? '…');
}

export function snippetCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const lang = languageOf(ctx.state);
	if (!lang) return null;
	const choice = choiceCompletionSource(ctx);
	if (choice) return choice;
	const line = ctx.state.doc.lineAt(ctx.pos);
	const candidates = popupCandidates(snippetRegistry().languages[lang].popup, line.text.slice(0, ctx.pos - line.from), line.from);
	if (!candidates) return null;
	const zone = snippetZoneAt(ctx.state, candidates.from, lang);
	const options: Completion[] = candidates.items
		.filter(({ compiled }) => contextAllows(compiled.snippet.context, zone))
		.map(({ compiled, prefix }) => {
			const { name, description } = compiled.snippet;
			const about = description || previewOf(compiled.body);
			// as vs code: the name beside the trigger, the description beside the list
			return {
				label: prefix,
				detail: name === prefix ? about : name,
				// eslint-disable-next-line id-denylist -- `info` is codemirror's Completion field
				...(name === prefix ? {} : { info: about }),
				type: 'text',
				boost: Math.max(-99, Math.min(99, compiled.snippet.priority)),
				apply: (view: CMView, _c: Completion, from: number, to: number) => {
					// the prefix was typed before the popup, so one undo gives it back
					view.state.facet(undoStop)();
					expandSnippet(view, [{ body: compiled.body, from, to, selection: '' }]);
				}
			};
		});
	return options.length ? { from: candidates.from, options } : null;
}

function autoExpansion(stopUndoCapture: () => void): Extension {
	return EditorView.inputHandler.of((view, from, to, text) => {
		const lang = languageOf(view.state);
		if (!lang || view.composing || view.state.selection.ranges.length > 1) return false;
		const list = snippetRegistry().languages[lang].auto;
		const line = view.state.doc.lineAt(from);
		if (!list.length || to > line.to || text.includes('\n')) return false;
		const before = line.text.slice(0, from - line.from) + text;
		for (const match of autoMatches(list, before, line.from)) {
			const zone = snippetZoneAt(view.state, Math.min(match.from, from), lang);
			if (!contextAllows(match.compiled.snippet.context, zone)) continue;
			// the character goes in on its own first, so one undo gives back what was typed
			view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.type' });
			stopUndoCapture();
			expandSnippet(view, [{ body: match.compiled.body, from: match.from, to: from + text.length, selection: '' }], match.captures);
			return true;
		}
		return false;
	});
}

function spotsOf(state: EditorState, bodyAt: (from: number) => string): SnippetSpot[] {
	return state.selection.ranges.map(({ from, to }) => ({ body: bodyAt(from), from, to, selection: state.sliceDoc(from, to) }));
}

/** a body with ${TM_SELECTED_TEXT} takes the selection in */
function runOnSelection(view: CMView, compiled: CompiledSnippet): void {
	const { state } = view;
	if (state.selection.ranges.some(({ from, to }) => cutsThroughSyntax(state, from, to, compiled.lang))) {
		toaster.info({ title: m.wrap_refused_title(), description: m.wrap_refused_desc() });
		return;
	}
	expandSnippet(
		view,
		spotsOf(state, () => compiled.body)
	);
	view.focus();
}

function runKeyed(view: CMView, compiled: CompiledSnippet): boolean {
	const sel = view.state.selection.main;
	if (!contextAllows(compiled.snippet.context, snippetZoneAt(view.state, sel.from, compiled.lang))) return false;
	if (usesSelection(compiled.body)) runOnSelection(view, compiled);
	else
		expandSnippet(
			view,
			spotsOf(view.state, () => compiled.body)
		);
	return true;
}

const keyedConf = new Compartment();

function keyedBindings(lang: SnippetLanguage): Extension {
	return keymap.of(
		snippetRegistry().languages[lang].keyed.map((compiled) => ({
			key: compiled.snippet.key!,
			run: (view: CMView) => runKeyed(view, compiled)
		}))
	);
}

// app shortcuts win: these sit below every other keymap
function keyedSnippets(lang: SnippetLanguage): Extension {
	return [
		Prec.low(keyedConf.of(keyedBindings(lang))),
		ViewPlugin.define((view) => {
			const off = onSnippetRegistry(() => queueMicrotask(() => view.dispatch({ effects: keyedConf.reconfigure(keyedBindings(lang)) })));
			return { destroy: off };
		})
	];
}

const openChoices = EditorView.updateListener.of((update) => {
	if (!update.selectionSet || update.docChanged || completionStatus(update.state) !== null) return;
	const sel = update.state.selection.main;
	if (choiceFieldAt(update.state, sel.from, sel.to)) startCompletion(update.view);
});

export type SourceSnippetOptions = {
	/** so an expansion and its trigger undo separately */
	stopUndoCapture?: () => void;
};

/** latex and markdown take snippetCompletionSource into their own completion */
export function sourceSnippets(lang: SnippetLanguage, options: SourceSnippetOptions = {}): Extension {
	const stopUndoCapture = options.stopUndoCapture ?? (() => {});
	return [
		snippetLanguage.of(lang),
		undoStop.of(stopUndoCapture),
		snippetSession,
		choiceFields,
		autoExpansion(stopUndoCapture),
		mathKeys(lang, stopUndoCapture),
		keyedSnippets(lang),
		openChoices,
		// typst completion otherwise comes from tinymist alone
		lang === 'typst' ? [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: snippetCompletionSource }])] : []
	];
}
