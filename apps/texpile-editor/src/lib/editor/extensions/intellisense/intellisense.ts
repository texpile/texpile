// public entry point for the intellisense module: completion, keyboard shortcuts, hover, folding,
// and go-to-definition, composed for either a .tex buffer or a .bib buffer.
import { autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorView, tooltips } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { latexCompletionSource, bibFileCompletionSource } from './completion/dispatch';
import { frecencyTracker } from './completion/frecency';
import { formatShortcuts } from './shortcuts';
import { latexHover } from './hover';
import { latexFolding } from './fold';
import { goToDefinition, type DefinitionHooks } from './definition';

export { latexCompletionSource, bibFileCompletionSource };

interface IntellisenseOptions {
	/** popup escapes a node's own box; needed for completions/hover inside a raw/inline LaTeX chip. */
	tooltipsInBody?: boolean;
	/** .bib files get entry-type/field completion instead of the LaTeX macro/citation/ref dispatch. */
	bib?: boolean;
}

// CodeMirror re-queries completion only on INSERTED text; deletions never reactivate it. This repairs it,
// but forcing every source on every backspace is too dear on big buffers, so a line-local guard runs first:
// only fire when the text before the cursor plausibly sits in a trigger context. Supersets of the
// matchBefore regexes in completion/dispatch.ts + the sources (which are line-local too, so nothing is lost):
// bare/partial macro incl. delimiter families, any \cmd's open {…/[… arg (cite/ref/begin/usepackage/…),
// a just-closed \begin{name}, ^{/_{ scripts, @ mnemonics.
const TEX_CONTEXT =
	/\\(?:[a-zA-Z]*|(?:left|[Bb]ig{1,2}[lmr]?)?(?:[({[|]|\\[{|])?)$|\\.*(?:\{[^{}]*|\[[^\]]*)$|\\begin\{[^{}\s]+\}$|[\^_]\{[^{}]*$|@@?[^\s@]*$/;
// bibFile.ts's three triggers: @entrytype, bare field name, field = value
const BIB_CONTEXT = /^\s*(?:@?[a-zA-Z]*|[a-zA-Z]+\s*=\s*[{"]?[^,{}"\n]*)$/;

function reactivate(context: RegExp): Extension {
	return EditorView.updateListener.of((update) => {
		if (completionStatus(update.state) !== null) return; // active session: CM manages it
		if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('delete'))) return;
		const head = update.state.selection.main.head;
		const line = update.state.doc.lineAt(head);
		if (context.test(line.text.slice(0, head - line.from))) startCompletion(update.view);
	});
}

/** completion only — used inside the WYSIWYG editor's raw/inline LaTeX node views. */
export function latexAutocomplete(opts: IntellisenseOptions = {}): Extension {
	const source = opts.bib ? bibFileCompletionSource : latexCompletionSource;
	const ext: Extension[] = [
		autocompletion({ override: [source], activateOnTyping: true, icons: false }),
		reactivate(opts.bib ? BIB_CONTEXT : TEX_CONTEXT),
		frecencyTracker()
	];
	if (opts.tooltipsInBody) ext.push(tooltips({ parent: document.body }));
	return ext;
}

/** completion + shortcuts + hover + folding + go-to-definition, for the full Source-mode editor. */
export function latexIntellisense(opts: IntellisenseOptions & DefinitionHooks = {}): Extension {
	const ext: Extension[] = [latexAutocomplete(opts)];
	if (!opts.bib) {
		ext.push(
			formatShortcuts(),
			latexHover(),
			latexFolding(),
			goToDefinition({ onJumpToFile: opts.onJumpToFile, onOpenFileAt: opts.onOpenFileAt })
		);
	}
	return ext;
}
