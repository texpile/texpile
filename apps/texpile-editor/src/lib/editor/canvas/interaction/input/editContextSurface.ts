// Chromium's input surface (11.1, D15): an EditContext on the root, which stays document.activeElement
import type { InputSink, InputSurface, TextMirror } from '../../contracts/inputTypes';
import type {
	EditContextBoundsRequest,
	EditContextFormatUpdate,
	EditContextHost,
	EditContextTextFormat,
	EditContextTextUpdate,
	EditContextWindow
} from './editContextTypes';

/** what EditContext edits in its own text; every other input type is the router's */
const CONTEXT_INPUT =
	/^(insertText|insertCompositionText|insertFromComposition|insertReplacementText|delete(Content|Word|SoftLine|HardLine))/;

const CLIPBOARD = ['copy', 'cut', 'paste'];

function preeditThickness(format: EditContextTextFormat): 'none' | 'thin' | 'thick' {
	if (/none/i.test(format.underlineStyle)) return 'none';
	return /thick/i.test(format.underlineThickness) ? 'thick' : /thin/i.test(format.underlineThickness) ? 'thin' : 'none';
}

export function createEditContextSurface(root: HTMLElement, sink: InputSink): InputSurface {
	const host = root as EditContextHost;
	const doc = root.ownerDocument;
	const context = new (doc.defaultView as unknown as EditContextWindow).EditContext();
	host.editContext = context;
	let composing = false;

	function push(mirror: TextMirror): void {
		if (composing) return;
		if (context.text !== mirror.text) context.updateText(0, context.text.length, mirror.text);
		const { start, end } = mirror.selection;
		if (context.selectionStart !== start || context.selectionEnd !== end) context.updateSelection(start, end);
	}

	const onRoot: [string, (event: Event) => void][] = [
		[
			'keydown',
			(e) => {
				const event = e as KeyboardEvent;
				if (composing || event.isComposing || event.keyCode === 229) return;
				if (!sink.keydown(event)) return;
				event.preventDefault();
				// a letter typed before the next frame lands where this key left the caret, not where the frame last put it
				push(sink.mirror());
			}
		],
		[
			'beforeinput',
			(e) => {
				const event = e as InputEvent;
				if (CONTEXT_INPUT.test(event.inputType)) return;
				event.preventDefault();
				sink.inputType(event.inputType, event.data, null);
				push(sink.mirror());
			}
		],
		['focus', () => sink.focusChanged()],
		['blur', () => sink.focusChanged()]
	];
	const onContext: [string, (event: Event) => void][] = [
		[
			'textupdate',
			(e) => {
				const event = e as EditContextTextUpdate;
				sink.text(event.text, { start: event.updateRangeStart, end: event.updateRangeEnd }, composing);
				push(sink.mirror());
			}
		],
		[
			'textformatupdate',
			(e) => {
				const formats = (e as EditContextFormatUpdate).getTextFormats();
				sink.compositionFormats(
					formats.map((format) => ({ range: { start: format.rangeStart, end: format.rangeEnd }, thickness: preeditThickness(format) }))
				);
			}
		],
		[
			'characterboundsupdate',
			(e) => {
				const { rangeStart, rangeEnd } = e as EditContextBoundsRequest;
				context.updateCharacterBounds(rangeStart, sink.characterBounds({ start: rangeStart, end: rangeEnd }));
			}
		],
		[
			'compositionstart',
			() => {
				composing = true;
				sink.compositionStart();
			}
		],
		[
			'compositionend',
			(e) => {
				composing = false;
				sink.compositionEnd((e as CompositionEvent).data ?? '');
				push(sink.mirror());
			}
		]
	];
	// with no DOM selection Chromium sends the clipboard events to the body, whatever has focus
	function onClipboard(event: Event): void {
		if (doc.activeElement === root) sink.clipboard(event as ClipboardEvent);
	}
	for (const type of CLIPBOARD) doc.addEventListener(type, onClipboard);
	for (const [type, listener] of onRoot) root.addEventListener(type, listener);
	for (const [type, listener] of onContext) context.addEventListener(type, listener);
	return {
		element: root,
		kind: 'editContext',
		focus: () => root.focus({ preventScroll: true }),
		hasFocus: () => doc.activeElement === root && doc.hasFocus(),
		sync(mirror, caret, control) {
			push(mirror);
			context.updateControlBounds(control);
			context.updateSelectionBounds(caret ?? control);
		},
		destroy() {
			for (const type of CLIPBOARD) doc.removeEventListener(type, onClipboard);
			for (const [type, listener] of onRoot) root.removeEventListener(type, listener);
			for (const [type, listener] of onContext) context.removeEventListener(type, listener);
			host.editContext = null;
		}
	};
}
