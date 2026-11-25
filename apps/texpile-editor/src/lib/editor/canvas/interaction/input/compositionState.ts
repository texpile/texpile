// an input method's preedit as document text (11.3, D16): every step carries the composition's id, so history keeps it as one
import { GapCursor } from 'prosemirror-gapcursor';
import type { Mappable } from 'prosemirror-transform';
import type { VisualView } from '../../contracts/viewTypes';

/** one textformatupdate range in document positions */
export type PreeditFormat = { readonly from: number; readonly to: number; readonly thickness: 'none' | 'thin' | 'thick' };
export type PreeditRange = { readonly from: number; readonly to: number };

export type CompositionParts = {
	readonly view: VisualView;
	/** view.composing */
	setComposing(on: boolean): void;
	/** the preedit no line may end inside, and its underline; null when it ends */
	preeditChanged(range: PreeditRange | null): void;
	/** handleDOMEvents for a synthetic event: gapcursor's beforeinput, inputrules' compositionend */
	domHandlers(event: Event): boolean;
};

let compositions = 0;

/** a synthetic event carrying an input type or the committed text, as InputEvent and CompositionEvent do */
function syntheticEvent(type: string, inputType: string | null, text: string | null): Event {
	const event = new Event(type, { cancelable: true });
	if (inputType !== null) Object.defineProperty(event, 'inputType', { value: inputType });
	if (text !== null) Object.defineProperty(event, 'data', { value: text });
	return event;
}

export class CompositionState {
	active = false;
	id = 0;
	/** the preedit's document range; empty before the first update */
	range: PreeditRange | null = null;
	formats: readonly PreeditFormat[] = [];
	private dispatching = false;

	constructor(private readonly parts: CompositionParts) {}

	/** an edit made elsewhere (a collaborator, the disk) moved the document under the preedit; null: a document replaced with no mapping */
	remap(mapping: Mappable | null): void {
		if (!this.range || this.dispatching) return;
		const from = mapping?.map(this.range.from, 1);
		this.range = mapping && from !== undefined ? { from, to: Math.max(from, mapping.map(this.range.to, -1)) } : null;
		this.formats = [];
		this.parts.preeditChanged(this.range);
	}

	start(): void {
		if (this.active) return;
		const { view } = this.parts;
		this.active = true;
		this.id = ++compositions;
		this.parts.setComposing(true);
		if (view.state.selection instanceof GapCursor) this.parts.domHandlers(syntheticEvent('beforeinput', 'insertCompositionText', null));
		if (!view.state.selection.empty) view.dispatch(view.state.tr.deleteSelection().setMeta('composition', this.id));
		view.canvas.nested()?.composition('start', '');
		this.range = null;
		this.formats = [];
	}

	update(text: string): void {
		if (!this.active) this.start();
		const { view } = this.parts;
		if (view.canvas.nested()?.composition('update', text)) return;
		const from = this.range?.from ?? view.state.selection.from;
		const to = this.range?.to ?? from;
		const tr = view.state.tr.insertText(text, from, to).setMeta('composition', this.id);
		this.range = text ? { from, to: from + text.length } : null;
		this.formats = [];
		this.parts.preeditChanged(this.range);
		this.dispatching = true;
		try {
			view.dispatch(tr);
		} finally {
			this.dispatching = false;
		}
	}

	format(formats: readonly PreeditFormat[]): void {
		this.formats = formats;
		this.parts.preeditChanged(this.range);
	}

	/** the committed text replaces the preedit; a press, a paste or a destroy ends it with what is there */
	end(committed: string | null = null): void {
		if (!this.active) return;
		const { view } = this.parts;
		const range = this.range;
		const preedit = range ? view.state.doc.textBetween(range.from, range.to) : '';
		const text = committed ?? preedit;
		this.active = false;
		this.range = null;
		this.formats = [];
		this.parts.preeditChanged(null);
		this.parts.setComposing(false);
		if (view.canvas.nested()?.composition('end', text)) return;
		if (text !== preedit) {
			const { from, to } = range ?? view.state.selection;
			view.dispatch(view.state.tr.insertText(text, from, to).setMeta('composition', this.id).scrollIntoView());
		}
		this.parts.domHandlers(syntheticEvent('compositionend', null, text));
	}
}
