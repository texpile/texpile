// paragraphs of the visual editor broken into lines as a whole (Knuth and Plass), with the browser held to those breaks
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { observe } from '$lib/runes/observe.svelte';
import { settings } from '$lib/settings';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { isLargeDocument } from '$lib/languages/latex/visual/largeDocument';
import { hasOldWords, pmSuggestionsKey } from '../extensions/pmSuggestionsState';
import { contentWidth } from '../lineBoxes';
import { ColumnWidth } from '$lib/resizing/columnWidth';
import { holdEditor, releaseEditor } from '$lib/resizing/heldEditor';
import { compositionWrapPlugin } from './compositionWrap';
import { hyphenSelectionPlugin } from './hyphenSelection';
import { decorationsFor, marksToSwap, plainlyJustified } from './breakDecorations';
import type { DocumentHyphenation } from './documentHyphenationLanguage';
import { isHeldBlock } from './heldBlocks';
import { loadHyphenator, readyHyphenator } from './hyphenationLanguages';
import { inlineBoxWatch } from './inlineBoxWatch';
import { linesKeptWhileTyping } from './linesKeptWhileTyping';
import { paragraphBreaks, sameBreaks, type BreakingContext, type ChosenBreaks, type ParagraphBreaks } from './paragraphBreaks';
import { textBlocksInChange } from './rebreak/blocksInChange';
import { rebreakLimit } from './rebreak/rebreakLimit';
import { struckWordsIn, type StruckWords } from './struckWords';
import { runStyleReader } from './textRunStyles';
import { wordBeingTypedKey, wordBeingTypedPlugin } from './wordBeingTyped';
import { forgetTextWidths } from './wordWidths';

// held to its breaks, left to the browser but justified like the rest, or left entirely alone
type DrawnAs = 'held' | 'plain' | 'alone';

type LineBreakState = {
	decorations: DecorationSet;
	/** how each paragraph is drawn now. In the state because a swapped in state starts empty yet can bring the same nodes back */
	shown: WeakMap<PMNode, DrawnAs>;
	/** a document too large to break carries no decorations, and one rule justifies it when the text is justified */
	plain: boolean;
};

export const lineBreakKey = new PluginKey<LineBreakState>('texpile-line-breaks');

// a line that failed to break where it was told to runs past the edge by far more than rounding does
const SPILL_ALLOWANCE = 2;
// the number a heading prints before its words (app.css), which takes room on its first line
const LEAD_ATTRIBUTES = ['data-number'];

// a line end inside a suggestion's struck words goes on the widget's own spans, which no decoration reaches; ProseMirror
// ignores changes inside a widget, and a redrawn widget comes back bare, so this runs again after every redraw
function markStruckWords(struck: StruckWords[], breaks: ChosenBreaks): void {
	for (const words of struck) {
		if (words.lineEnd) continue;
		const ends = breaks.marks.flatMap((mark) => (mark.inside?.key === words.key ? [mark.inside] : []));
		for (const span of words.element.querySelectorAll<HTMLElement>('[data-i]')) {
			const i = Number(span.dataset.i);
			span.classList.toggle(
				'pm-line-break',
				ends.some((end) => end.from <= i && i < end.to)
			);
		}
	}
}

// the browser's own wrapping, justified only where the breaker's lines were: a heading stays ragged
function leftToBrowser(breaks: ParagraphBreaks | undefined): 'native' | 'untouched' {
	if (typeof breaks === 'object') return breaks.justified ? 'native' : 'untouched';
	return breaks ?? 'native';
}

// the visual editors on the page, each asked whether its width changed
const widthChecks = new Set<(observed?: boolean) => void>();

/** after the app changed the editors' widths itself (a layout picked): broken again before the frame is drawn, which
 *  a resize observer comes too late for */
export function rebreakResizedEditors(): void {
	for (const check of widthChecks) check();
}

function lineBreaker(view: EditorView): { update(view: EditorView, before: EditorState): void; destroy(): void } {
	let broken = new WeakMap<PMNode, ParagraphBreaks>();
	let outdated = new WeakSet<PMNode>();
	let retried = new WeakSet<PMNode>();
	let resized = new WeakSet<PMNode>();
	const limit = rebreakLimit();
	let widths = new WeakMap<HTMLElement, number>();
	const unchecked = new Set<HTMLElement>();
	let begun = false;
	let checkFrame = 0;
	let rebreakFrame = 0;
	let scratchNextFrame = false;
	let afterComposition = 0;
	let wanted = '';
	let language: DocumentHyphenation | undefined;
	const typing = linesKeptWhileTyping((paragraph) => broken.get(paragraph));

	// the held block an element belongs to, be it the block's own element or one inside a node view of its. An inline
	// formula keeps its source as content, so a position inside it resolves into the formula, not the paragraph
	function blockOf(element: Element): PMNode | null {
		if (!view.dom.contains(element)) return null;
		try {
			const $pos = view.state.doc.resolve(view.posAtDOM(element, 0));
			for (let depth = $pos.depth; depth > 0; depth--) {
				const node = $pos.node(depth);
				if (node.isTextblock) return isHeldBlock(node) ? node : null;
			}
			return null;
		} catch {
			return null;
		}
	}

	function publish(next: LineBreakState): void {
		view.dispatch(view.state.tr.setMeta(lineBreakKey, next).setMeta('addToHistory', false));
	}

	function rebreakNextFrame(fromScratch: boolean): void {
		// a width change asking to start over can come after a table cell's resize already asked for less, in the same
		// round of observers; the frame does the most anyone asked
		scratchNextFrame ||= fromScratch;
		// never from inside a resize observer: new breaks change heights, which one may not cause from its own callback
		if (rebreakFrame) return;
		rebreakFrame = requestAnimationFrame(() => {
			rebreakFrame = 0;
			const scratch = scratchNextFrame;
			scratchNextFrame = false;
			if (scratch) startOver();
			else rebreak();
			// already inside a frame: the check it asked for would wait for the next one, and this one be drawn spilling
			checkNow();
		});
	}

	// a theorem's head floats beside its first paragraph, whose first line it shortens
	function blockBeside(head: Element): PMNode | null {
		const body = head.nextElementSibling;
		if (!body || getComputedStyle(head).float === 'none') return null;
		const first = body.matches('p') ? body : body.querySelector('p');
		return first ? blockOf(first) : null;
	}

	/** something on the paragraph's lines changed size with no edit to its words */
	function sizeChanged(paragraph: PMNode): void {
		resized.add(paragraph);
		outdated.add(paragraph);
		retried.delete(paragraph);
	}

	const inlineBoxes = inlineBoxWatch((element) => {
		const paragraph = blockOf(element);
		if (!paragraph) return;
		sizeChanged(paragraph);
		rebreakNextFrame(false);
	});

	// a cell whose column changed width is broken again for it; two cells trading widths hit the same limit as views
	// trading sizes
	const cellSizes = new ResizeObserver((entries) => {
		for (const { target } of entries) {
			if (!(target instanceof HTMLElement)) continue;
			const known = widths.get(target);
			if (known === undefined || Math.abs(contentWidth(target) - known) < 0.5) continue;
			widths.delete(target);
			const paragraph = blockOf(target);
			if (!paragraph) continue;
			sizeChanged(paragraph);
			rebreakNextFrame(false);
		}
	});

	const context: BreakingContext = {
		justified: true,
		hyphenator: null,
		styleOf: runStyleReader(),
		inlineWidthOf: inlineBoxes.widthOf,
		wholeWord: null,
		widthOf(block) {
			let width = widths.get(block);
			if (width === undefined) widths.set(block, (width = contentWidth(block)));
			return width;
		}
	};

	function drawnAs(breaks: ParagraphBreaks): DrawnAs {
		if (typeof breaks === 'object') return 'held';
		return breaks !== 'untouched' && context.justified ? 'plain' : 'alone';
	}

	function check(): void {
		checkFrame = 0;
		if (view.isDestroyed) return;
		let spilled = false;
		for (const block of unchecked) {
			if (block.scrollWidth <= block.clientWidth + SPILL_ALLOWANCE) continue;
			const paragraph = blockOf(block);
			if (!paragraph) continue;
			// once more with what is on the page now (a table cell may have been given another width), then the browser
			// takes it
			widths.delete(block);
			if (retried.has(paragraph)) broken.set(paragraph, leftToBrowser(broken.get(paragraph)));
			else outdated.add(paragraph);
			retried.add(paragraph);
			spilled = true;
		}
		unchecked.clear();
		if (!spilled) return;
		rebreak();
		// the retry is checked in this same frame: waiting for the next would draw it, spilling or not yet settled
		checkNow();
	}

	function checkNow(): void {
		if (!checkFrame) return;
		cancelAnimationFrame(checkFrame);
		check();
	}

	function rebreak(fromScratch = false): void {
		// a redraw in the middle of a composition can end it; its end comes back here
		if (view.isDestroyed || view.composing || width.moving) return;
		// the first break is startOver's, a microtask after the view is built: a transaction that lands before it would
		// break the whole document, and startOver would break it again
		if (!begun && !fromScratch) return;
		const { doc } = view.state;
		const held = lineBreakKey.getState(view.state)!;
		context.wholeWord = wordBeingTypedKey.getState(view.state) ?? null;
		const current = fromScratch ? DecorationSet.empty : held.decorations;
		const shown = fromScratch ? new WeakMap<PMNode, DrawnAs>() : held.shown;
		const stale: Decoration[] = [];
		const fresh: Decoration[] = [];
		const withStruck: [PMNode, number, HTMLElement, ChosenBreaks][] = [];
		const anyStruck = (pmSuggestionsKey.getState(view.state)?.ranges ?? []).some((r) => hasOldWords(r) || r.gone || r.brk === 'removed');
		const large = isLargeDocument(doc);
		if (!large)
			doc.descendants((node, pos, parent) => {
				if (!node.isTextblock) return true;
				if (!isHeldBlock(node) || node.childCount === 0) return false;
				// a table sizes its columns from how its cells wrap, so a held cell can be given another width later
				if (parent?.type.spec.tableRole === 'cell' || parent?.type.spec.tableRole === 'header_cell') {
					const block = view.nodeDOM(pos);
					if (block instanceof HTMLElement) cellSizes.observe(block);
				}
				const known = broken.get(node);
				const settled = known !== undefined && !outdated.has(node) && shown.get(node) === drawnAs(known);
				// a settled paragraph is visited again only for the marks inside its struck words, which a redraw takes off
				if (settled && (typeof known !== 'object' || !anyStruck)) return false;
				const block = view.nodeDOM(pos);
				if (!(block instanceof HTMLElement)) return false;
				const struck = anyStruck ? struckWordsIn(view, node, pos, block) : [];
				if (settled) {
					if (typeof known === 'object' && struck?.length) withStruck.push([node, pos, block, known]);
					return false;
				}
				let breaks = known;
				if (!breaks || outdated.has(node)) {
					breaks = struck ? paragraphBreaks(view, node, pos, block, context, struck, typing.take(node)) : 'native';
					// the same lines again are no move: a chip drawn again as it was, a caret passing through
					const moved = known !== undefined && !sameBreaks(known, breaks);
					if (moved && resized.has(node) && limit.reached(node)) breaks = leftToBrowser(breaks);
					resized.delete(node);
					broken.set(node, breaks);
					outdated.delete(node);
					if (typeof breaks === 'object') unchecked.add(block);
					if (known && sameBreaks(known, breaks) && shown.get(node) === drawnAs(breaks)) {
						if (typeof breaks === 'object' && struck?.length) withStruck.push([node, pos, block, breaks]);
						return false;
					}
				}
				const end = pos + node.nodeSize;
				const mine = current.find(pos, end).filter((old) => old.from >= pos && old.to <= end);
				const drawn = drawnAs(breaks);
				if (drawn === 'held' && typeof breaks === 'object') {
					const swap = marksToSwap(mine, decorationsFor(pos, node, breaks));
					stale.push(...swap.stale);
					fresh.push(...swap.fresh);
					if (struck?.length) withStruck.push([node, pos, block, breaks]);
				} else {
					// only the hold comes off. Taking every mark out at once leaves ProseMirror more stale pieces of text
					// than it looks past, and it then rebuilds the formulas and citations behind them
					stale.push(...mine.filter((old) => old.spec.holdsParagraph));
					if (drawn === 'plain') fresh.push(plainlyJustified(pos, node));
				}
				shown.set(node, drawn);
				return false;
			});
		const changed = stale.length > 0 || fresh.length > 0;
		const decorations = large ? DecorationSet.empty : changed ? current.remove(stale).add(doc, fresh) : current;
		const plain = large && context.justified;
		if (decorations !== held.decorations || shown !== held.shown || held.plain !== plain) publish({ decorations, shown, plain });
		// after the publish, so the marks land on the spans as they are drawn now
		for (const [paragraph, pos, block, breaks] of withStruck) {
			const struck = view.dom.contains(block) ? struckWordsIn(view, paragraph, pos, block) : null;
			if (struck) markStruckWords(struck, breaks);
		}
		if (unchecked.size > 0 && !checkFrame) checkFrame = requestAnimationFrame(check);
	}

	function startOver(): void {
		begun = true;
		width.breaking();
		broken = new WeakMap();
		outdated = new WeakSet();
		retried = new WeakSet();
		resized = new WeakSet();
		limit.reset();
		widths = new WeakMap();
		typing.forget();
		context.styleOf = runStyleReader();
		if (view.isDestroyed) return;
		rebreak(true);
		width.broken();
	}

	const width = new ColumnWidth(view.dom.parentElement ?? view.dom, {
		// from the observer the break waits a frame: new breaks change heights, which an observer may not cause itself
		breakNow(nextFrame) {
			if (nextFrame) return rebreakNextFrame(true);
			startOver();
			checkNow();
		},
		hold() {
			if (!view.isDestroyed && width.moving) holdEditor(view);
		},
		rest: () => releaseEditor(view, startOver)
	});
	function widthChanged(): void {
		width.changed();
	}
	widthChecks.add(widthChanged);

	// a citation that resolves or a formula that gets typeset changes width without a transaction, and so does a
	// heading's number or a theorem's head
	const inlineViews = new MutationObserver((records) => {
		const touched = new Set<PMNode>();
		for (const record of records) {
			const element = record.target instanceof Element ? record.target : record.target.parentElement;
			const swapped = [...record.addedNodes].some((node) => node instanceof HTMLElement && node.contentEditable === 'false');
			const inside = swapped || record.type === 'attributes' ? element : element?.closest('[contenteditable="false"]');
			const paragraph = inside ? (blockOf(inside) ?? blockBeside(inside)) : null;
			if (paragraph && broken.has(paragraph)) touched.add(paragraph);
		}
		touched.forEach(sizeChanged);
		if (touched.size > 0) rebreak();
	});
	inlineViews.observe(view.dom, { subtree: true, childList: true, characterData: true, attributeFilter: LEAD_ATTRIBUTES });

	function fontsLoaded(): void {
		forgetTextWidths();
		startOver();
	}
	document.fonts.addEventListener('loadingdone', fontsLoaded);

	function compositionEnded(): void {
		// the transaction that ends the composition has already gone by
		clearTimeout(afterComposition);
		afterComposition = window.setTimeout(rebreak, 60);
	}
	view.dom.addEventListener('compositionend', compositionEnded);

	const stopObserving = observe(
		(): { justified: boolean; language: DocumentHyphenation } => ({
			justified: settings.current.visualJustify !== false,
			// a document that names no language is taken for English
			language: settings.current.visualHyphenate === false ? 'none' : (templateFeaturesStore.current.hyphenationLanguage ?? 'en-us')
		}),
		(now) => {
			if (wanted === `${now.justified} ${now.language}`) return;
			wanted = `${now.justified} ${now.language}`;
			context.justified = now.justified;
			if (now.language !== language) {
				language = now.language;
				// a document swap builds this view again, with the patterns long in: taken at once, its lines are broken once
				context.hyphenator = now.language === 'none' ? null : (readyHyphenator(now.language) ?? null);
				if (now.language !== 'none' && !context.hyphenator)
					void loadHyphenator(now.language).then((hyphenator) => {
						if (language !== now.language) return;
						context.hyphenator = hyphenator;
						startOver();
					});
			}
			// the view is still being built when the first value arrives
			queueMicrotask(startOver);
		}
	);

	return {
		update(_, before) {
			const state = view.state;
			if (before.doc !== state.doc) {
				limit.reset();
				for (const block of textBlocksInChange(before.doc, state.doc)) {
					if (!broken.has(block)) continue;
					outdated.add(block);
					retried.delete(block);
					lineBreakKey.getState(state)?.shown.delete(block);
				}
			}
			const swapped = lineBreakKey.getState(before)?.shown !== lineBreakKey.getState(state)?.shown;
			const again = typing.toBreakAgain(before, state);
			for (const paragraph of again) {
				outdated.add(paragraph);
				retried.delete(paragraph);
			}
			if (swapped || again.length > 0 || before.doc !== state.doc || pmSuggestionsKey.getState(before) !== pmSuggestionsKey.getState(state))
				rebreak();
		},
		destroy() {
			if (checkFrame) cancelAnimationFrame(checkFrame);
			if (rebreakFrame) cancelAnimationFrame(rebreakFrame);
			clearTimeout(afterComposition);
			width.destroy();
			widthChecks.delete(widthChanged);
			cellSizes.disconnect();
			inlineBoxes.disconnect();
			inlineViews.disconnect();
			document.fonts.removeEventListener('loadingdone', fontsLoaded);
			view.dom.removeEventListener('compositionend', compositionEnded);
			stopObserving();
		}
	};
}

function lineBreakPlugin(): Plugin<LineBreakState> {
	return new Plugin<LineBreakState>({
		key: lineBreakKey,
		state: {
			init: () => ({ decorations: DecorationSet.empty, shown: new WeakMap(), plain: false }),
			apply(tr, held) {
				const next = tr.getMeta(lineBreakKey) as LineBreakState | undefined;
				if (next || !tr.docChanged) return next ?? held;
				return { ...held, decorations: held.decorations.map(tr.mapping, tr.doc) };
			}
		},
		props: {
			decorations: (state) => lineBreakKey.getState(state)?.decorations,
			attributes(state): Record<string, string> {
				return lineBreakKey.getState(state)?.plain ? { class: 'pm-lines-plain' } : {};
			}
		},
		view: lineBreaker
	});
}

export function lineBreakPlugins(): Plugin[] {
	return [wordBeingTypedPlugin(), compositionWrapPlugin(), lineBreakPlugin(), hyphenSelectionPlugin()];
}
