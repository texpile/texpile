// copy, cut and paste (11.4): the nested editor, its views' stopEvent, handleDOMEvents, then prosemirror-view's own handlers
import type { KeyNesting } from '../keys/keyRouter';
import type { VisualView } from '../../contracts/viewTypes';
import { NodeSelection } from 'prosemirror-state';
import { wholeBlockOf } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { runDomHandlers } from '../../view/domEvents';
import { clipboardText, pasteSlice, pastesPlain } from './pasteSlice';

type ClipboardNesting = Pick<KeyNesting, 'active'> & { stopsEvent(event: ClipboardEvent): boolean };

export class ClipboardController {
	constructor(
		private readonly view: VisualView,
		private readonly nested: ClipboardNesting
	) {}

	/** true when the canvas took the event */
	handle(event: ClipboardEvent): boolean {
		const { view } = this;
		if (this.nested.active()?.clipboard(event)) return true;
		if (this.nested.stopsEvent(event)) return false;
		if (runDomHandlers(view, event)) return true;
		if (event.type === 'copy') return this.copy(event);
		if (!view.editable) return false;
		return event.type === 'cut' ? this.copy(event) : this.paste(event);
	}

	/** the editor's clipboard HTML beside the language's own text (clipboardTextSerializer) */
	private copy(event: ClipboardEvent): boolean {
		const { view } = this;
		const clipboard = event.clipboardData;
		if (view.state.selection.empty || !clipboard) return false;
		const blockPos = wholeBlockOf(view.state.selection);
		const selection = blockPos === null ? view.state.selection : NodeSelection.create(view.state.doc, blockPos);
		const { dom, text } = view.serializeForClipboard(selection.content());
		event.preventDefault();
		clipboard.clearData();
		clipboard.setData('text/html', dom.innerHTML);
		clipboard.setData('text/plain', text);
		if (event.type !== 'cut') return true;
		if (selection !== view.state.selection) view.dispatch(view.state.tr.setSelection(selection));
		view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
		return true;
	}

	private paste(event: ClipboardEvent): boolean {
		const { view } = this;
		const clipboard = event.clipboardData;
		// prosemirror-view leaves a paste during a composition to the browser
		if (view.composing || !clipboard) return false;
		if (!pasteSlice(view, clipboardText(clipboard), clipboard.getData('text/html'), pastesPlain(view.input), event)) return false;
		event.preventDefault();
		return true;
	}
}
