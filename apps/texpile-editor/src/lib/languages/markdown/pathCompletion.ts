// File-path completion for MARKDOWN source mode: the target half of [text](…) and ![alt](…).
//
// Almost none of this is new. filePathStore already holds a flat, project-wide, root-relative file
// list that is populated regardless of dialect, and pathOption already formats an entry so
// CodeMirror's fuzzy matcher finds it by basename as well as by full path. What LaTeX and markdown
// do not share is the TRIGGER: the LaTeX source looks for \includegraphics{…, and this looks for an
// unclosed link target. So the trigger is the only thing written here.
import { autocompletion, completionStatus, startCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { snippetCompletionSource } from '$lib/editor/snippets/cmSnippets';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { filePathStore } from '$lib/stores/editorStore';
import { IMG_EXTS, JUNK_PATH, pathOption } from '$lib/editor/source/filePathCompletion';

/**
 * `[text](path` or `![alt](path`, with the caret still inside the parentheses.
 *
 * The target may hold neither ')' nor whitespace. A space there begins markdown's optional link
 * title - `](path "a caption")` - which is not part of the path, and stopping at it is what keeps a
 * completion from being offered (and inserted) in the middle of someone's caption.
 */
const LINK_TARGET = /(!?)\[[^\]\n]*\]\(([^)\s]*)$/;

export function mdPathCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const before = ctx.matchBefore(LINK_TARGET);
	if (!before) return null;
	const m = LINK_TARGET.exec(before.text);
	if (!m) return null;
	const isImage = m[1] === '!';

	let paths = filePathStore.current;
	if (!paths.length) return null;
	// an image link can only sensibly point at a figure; a plain link at anything but build output
	paths = isImage ? paths.filter((p) => IMG_EXTS.some((e) => p.toLowerCase().endsWith('.' + e))) : paths.filter((p) => !JUNK_PATH.test(p));
	if (!paths.length) return null;

	// derived from the captured target rather than by searching for '(', because a file called
	// fig(1).png would otherwise put the replacement boundary inside its own name
	const from = ctx.pos - m[2].length;
	// nothing is stripped: a markdown target is the literal path, unlike \include{…} which appends
	// its own .tex
	return { from, options: paths.map((p) => pathOption(p, false)), validFor: /^[^)\s]*$/ };
}

/**
 * CodeMirror re-queries completion only on INSERTED text, so backspacing back into a link target
 * leaves the list closed. Same repair the LaTeX side makes, with a line-local guard so the source
 * only runs when the caret plausibly sits in a target.
 */
function reactivateOnDelete(): Extension {
	return EditorView.updateListener.of((update) => {
		if (completionStatus(update.state) !== null) return; // a session is open: CM manages it
		if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('delete'))) return;
		const head = update.state.selection.main.head;
		const line = update.state.doc.lineAt(head);
		if (LINK_TARGET.test(line.text.slice(0, head - line.from))) startCompletion(update.view);
	});
}

/** path completion for markdown links and images, plus snippets: the whole of md source-mode completion. */
export function mdPathCompletion(): Extension {
	return [
		autocompletion({ override: [mdPathCompletionSource, snippetCompletionSource], activateOnTyping: true, icons: false }),
		reactivateOnDelete()
	];
}
