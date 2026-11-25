// the input surface of engines without EditContext (11.1): a hidden textarea at the caret holding the caret block's text
import type { InputSink, InputSurface, MirrorRange, TextMirror } from '../../contracts/inputTypes';

const TEXTAREA_STYLE =
	'position:absolute;left:0;top:0;width:1px;height:1em;padding:0;border:0;opacity:0;resize:none;overflow:hidden;white-space:pre;z-index:-1';

function textareaRange(area: HTMLTextAreaElement): MirrorRange {
	return { start: area.selectionStart, end: area.selectionEnd };
}

/** what a replacement changed: where the value and the mirror text start and stop agreeing */
function replacedRange(before: string, after: string): { range: MirrorRange; text: string } {
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let tail = 0;
	while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail])
		tail++;
	return { range: { start, end: before.length - tail }, text: after.slice(start, after.length - tail) };
}

export function createTextareaSurface(root: HTMLElement, sink: InputSink): InputSurface {
	const area = root.ownerDocument.createElement('textarea');
	area.setAttribute('data-canvas-input', '');
	area.setAttribute('autocapitalize', 'off');
	area.setAttribute('autocomplete', 'off');
	area.spellcheck = false;
	area.style.cssText = TEXTAREA_STYLE;
	root.appendChild(area);
	let composing = false;

	function push(mirror: TextMirror): void {
		if (composing) return;
		if (area.value !== mirror.text) area.value = mirror.text;
		const { start, end } = mirror.selection;
		area.setSelectionRange(Math.min(start, end), Math.max(start, end), start > end ? 'backward' : 'forward');
	}

	const listeners: [string, (event: Event) => void][] = [
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
				// a replacement (spelling, an accent picker) lands in the value first and is read back on input
				if (composing || event.inputType === 'insertCompositionText' || event.inputType === 'insertReplacementText') return;
				event.preventDefault();
				if (event.inputType === 'insertText' && event.data) sink.text(event.data, textareaRange(area), false);
				else sink.inputType(event.inputType, event.data, null);
				push(sink.mirror());
			}
		],
		[
			'input',
			(e) => {
				if ((e as InputEvent).inputType !== 'insertReplacementText') return;
				const replaced = replacedRange(sink.mirror().text, area.value);
				sink.text(replaced.text, replaced.range, false);
				push(sink.mirror());
			}
		],
		[
			'compositionstart',
			() => {
				composing = true;
				sink.compositionStart();
			}
		],
		['compositionupdate', (e) => sink.text((e as CompositionEvent).data ?? '', textareaRange(area), true)],
		[
			'compositionend',
			(e) => {
				composing = false;
				sink.compositionEnd((e as CompositionEvent).data ?? '');
				push(sink.mirror());
			}
		],
		['copy', (e) => sink.clipboard(e as ClipboardEvent)],
		['cut', (e) => sink.clipboard(e as ClipboardEvent)],
		['paste', (e) => sink.clipboard(e as ClipboardEvent)],
		['focus', () => sink.focusChanged()],
		['blur', () => sink.focusChanged()]
	];
	for (const [type, listener] of listeners) area.addEventListener(type, listener);
	return {
		element: area,
		kind: 'textarea',
		focus: () => area.focus({ preventScroll: true }),
		hasFocus: () => area.ownerDocument.activeElement === area && area.ownerDocument.hasFocus(),
		sync(mirror, caret, control) {
			push(mirror);
			if (!caret) return;
			area.style.left = `${caret.left - control.left}px`;
			area.style.top = `${caret.top - control.top}px`;
		},
		destroy() {
			for (const [type, listener] of listeners) area.removeEventListener(type, listener);
			area.remove();
		}
	};
}
