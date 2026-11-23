// the view's text input (11.1 to 11.3): the input surface, what it hands the view, the composition and the caret block's mirror
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CompositionPaint } from '../contracts/engineTypes';
import type { InputSink, InputSurface, MirrorRange, TextMirror } from '../contracts/inputTypes';
import type { NestedEditor } from '../contracts/nodeViewTypes';
import type { ClipboardController } from '../interaction/clipboard/clipboardController';
import { insertTypedText } from '../interaction/editing/textInput';
import { CompositionState } from '../interaction/input/compositionState';
import { createInputSurface } from '../interaction/input/inputSurface';
import { emptyMirror, textMirrorOf } from '../interaction/input/textMirror';
import { runInputType } from '../interaction/input/osInputType';
import type { KeyRouter } from '../interaction/keys/keyRouter';
import { runDomHandlers } from './domEvents';

export type ViewInputParts = {
	readonly exposed: EditorView;
	readonly dom: HTMLElement;
	readonly keys: KeyRouter;
	readonly clipboard: ClipboardController;
	/** a formula session takes typed text and compositions itself (13.7) */
	nested(): NestedEditor | null;
	/** client rects of the characters from `from` to `to`, document positions */
	characterRects(from: number, to: number): DOMRect[];
	/** view.composing (D16) */
	setComposing(on: boolean): void;
	/** the preedit no line may end inside; the frame underlines it */
	preeditChanged(range: { from: number; to: number } | null): void;
	/** a key or typed text: the reveal's key window and frameStats().keyToFrameMs */
	noteInput(at?: number): void;
	focusChanged(): void;
};

function sameRange(a: MirrorRange, b: MirrorRange): boolean {
	return Math.min(a.start, a.end) === Math.min(b.start, b.end) && Math.max(a.start, a.end) === Math.max(b.start, b.end);
}

export class ViewInput {
	readonly composition: CompositionState;
	readonly surface: InputSurface;
	private mirrored: { state: EditorState; mirror: TextMirror } | null = null;
	/** what the surface holds: a key can arrive before the next frame syncs it to a moved selection */
	private surfaced: TextMirror | null = null;

	constructor(private readonly parts: ViewInputParts) {
		const { exposed } = parts;
		this.composition = new CompositionState({
			view: exposed,
			setComposing: parts.setComposing,
			preeditChanged: parts.preeditChanged,
			domHandlers: (event) => runDomHandlers(exposed, event)
		});
		this.surface = createInputSurface(parts.dom, this.sink());
	}

	/** the caret block's text for the input surface, built again only after the state changed */
	mirror(): TextMirror {
		const { state } = this.parts.exposed;
		if (this.mathOwner()) return emptyMirror(state.selection.from);
		if (this.mirrored?.state !== state) this.mirrored = { state, mirror: textMirrorOf(state) };
		return this.mirrored.mirror;
	}

	private mathOwner(): NestedEditor | null {
		const owner = this.parts.nested();
		return owner?.kind === 'math' ? owner : null;
	}

	preedit(): CompositionPaint | null {
		const { range, formats } = this.composition;
		return range && { ...range, formats };
	}

	/** after a painted frame: the surface follows the caret block and the caret */
	follow(caret: DOMRect | null): void {
		this.surfaced = this.mirror();
		this.surface.sync(this.surfaced, caret, this.parts.dom.getBoundingClientRect());
	}

	private sink(): InputSink {
		const { parts, composition } = this;
		return {
			keydown(event) {
				parts.noteInput(event.timeStamp);
				return parts.keys.keydown(event);
			},
			text: (text, range, composing) => {
				if (!parts.exposed.editable) return;
				parts.noteInput();
				const math = this.mathOwner();
				if (math) {
					if (composing) math.composition('update', text);
					else math.insertText(text, null);
					return;
				}
				if (composing) {
					composition.update(text);
					return;
				}
				const view = parts.exposed;
				const shown = this.surfaced ?? this.mirror();
				// typed over the selection; any other range is the OS replacing text (autocorrect, an accent picker)
				const { from, to } = sameRange(range, shown.selection)
					? view.state.selection
					: { from: shown.toDoc(Math.min(range.start, range.end)), to: shown.toDoc(Math.max(range.start, range.end)) };
				insertTypedText(view, text, from, to);
			},
			compositionStart: () => {
				if (!parts.exposed.editable) return;
				const math = this.mathOwner();
				if (!math) return composition.start();
				parts.setComposing(true);
				math.composition('start', '');
			},
			compositionEnd: (committed) => {
				const math = this.mathOwner();
				if (!math) return composition.end(committed || null);
				parts.setComposing(false);
				math.composition('end', committed);
			},
			compositionFormats: (formats) => {
				const mirror = this.mirror();
				composition.format(
					formats.map(({ range, thickness }) => ({ from: mirror.toDoc(range.start), to: mirror.toDoc(range.end), thickness }))
				);
			},
			inputType: (inputType) => void (parts.exposed.editable && runInputType(parts.keys, inputType)),
			clipboard: (event) => void parts.clipboard.handle(event),
			focusChanged: () => parts.focusChanged(),
			mirror: () => (this.surfaced = this.mirror()),
			characterBounds: (range) => {
				const mirror = this.mirror();
				const rects: DOMRect[] = [];
				for (let offset = range.start; offset < range.end; offset++)
					rects.push(...parts.characterRects(mirror.toDoc(offset), mirror.toDoc(offset) + 1));
				return rects;
			}
		};
	}
}
