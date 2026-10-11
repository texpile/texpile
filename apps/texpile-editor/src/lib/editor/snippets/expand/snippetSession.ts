// the places of an expanded snippet, on codemirror's public pieces: its own snippet() cannot hold a brace in a default,
// a place in a place, a choice or a transform, and keeps its session private. codemirror's completion snippets keep theirs
import { hasNextSnippetField, hasPrevSnippetField } from '@codemirror/autocomplete';
import {
	EditorSelection,
	MapMode,
	Prec,
	StateEffect,
	StateField,
	type ChangeDesc,
	type EditorState,
	type Extension
} from '@codemirror/state';
import { Decoration, EditorView, keymap, WidgetType, type Command, type DecorationSet } from '@codemirror/view';
import { applyTransform, type SnippetTransform } from './body/bodyTransform';

export class SnippetFieldRange {
	constructor(
		readonly field: number,
		readonly from: number,
		readonly to: number,
		readonly authored: boolean,
		readonly transform?: SnippetTransform
	) {}

	map(changes: ChangeDesc): SnippetFieldRange {
		const from = changes.mapPos(this.from, -1, MapMode.TrackDel);
		const to = changes.mapPos(this.to, 1, MapMode.TrackDel);
		// cut out with the text around it, as a place inside a place typed over
		if (from === null || to === null) {
			const at = changes.mapPos(this.from, -1);
			return new SnippetFieldRange(this.field, at, at, this.authored, this.transform);
		}
		return new SnippetFieldRange(this.field, from, to, this.authored, this.transform);
	}
}

class EmptyPlace extends WidgetType {
	// eslint-disable-next-line @typescript-eslint/naming-convention -- @codemirror WidgetType API method
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'cm-snippetFieldPosition';
		return span;
	}
	override ignoreEvent(): boolean {
		return false;
	}
}
const emptyPlace = Decoration.widget({ widget: new EmptyPlace() });
const filledPlace = Decoration.mark({ class: 'cm-snippetField' });

class Session {
	readonly deco: DecorationSet;
	constructor(
		readonly ranges: readonly SnippetFieldRange[],
		readonly active: number
	) {
		this.deco = Decoration.set(
			ranges.map((r) => (r.from === r.to ? emptyPlace : filledPlace).range(r.from, r.to)),
			true
		);
	}

	map(changes: ChangeDesc): Session {
		return new Session(
			this.ranges.map((r) => r.map(changes)),
			this.active
		);
	}

	get last(): number {
		return Math.max(...this.ranges.map((r) => r.field));
	}

	holds(selection: EditorSelection): boolean {
		return selection.ranges.every((s) => this.ranges.some((r) => r.field === this.active && r.from <= s.from && r.to >= s.to));
	}

	selection(field: number): EditorSelection {
		return EditorSelection.create(this.ranges.filter((r) => r.field === field).map((r) => EditorSelection.range(r.from, r.to)));
	}
}

const setSession = StateEffect.define<Session | null>({ map: (session, changes) => session?.map(changes) ?? null });

const sessionField = StateField.define<Session | null>({
	create: () => null,
	update(before, tr) {
		for (const e of tr.effects) if (e.is(setSession)) return e.value;
		const session = before && tr.docChanged ? before.map(tr.changes) : before;
		// moving out of the place ends it, as in codemirror's own snippets
		return session && tr.selection && !session.holds(tr.selection) ? null : session;
	},
	provide: (f) => EditorView.decorations.from(f, (session) => session?.deco ?? Decoration.none)
});

function cutOut(session: Session, field: number): boolean {
	return session.ranges.every((r) => r.field !== field || (r.authored && r.from === r.to));
}

// as vs code: leaving a place applies its transforms, and a place cut out with its text is skipped
function moveField(dir: 1 | -1): Command {
	return (view) => {
		const { state } = view;
		const session = state.field(sessionField, false);
		if (!session) return false;
		const last = session.last;
		let next = session.active + dir;
		while (next > 0 && next < last && cutOut(session, next)) next += dir;
		if (next < 0) return false;
		const changes = state.changes(
			session.ranges.flatMap((r) => {
				if (r.field !== session.active || !r.transform) return [];
				const before = state.sliceDoc(r.from, r.to);
				const after = applyTransform(r.transform, before);
				return after === before ? [] : [{ from: r.from, to: r.to, insert: after }];
			})
		);
		const moved = session.map(changes);
		view.dispatch({
			changes,
			selection: moved.selection(next),
			effects: setSession.of(dir > 0 && next === last ? null : new Session(moved.ranges, next)),
			scrollIntoView: true
		});
		return true;
	};
}

function endSession(view: EditorView): boolean {
	if (!view.state.field(sessionField, false)) return false;
	view.dispatch({ effects: setSession.of(null) });
	return true;
}

// a click into another place goes there, as in codemirror's own snippets
const clickIntoPlace = EditorView.domEventHandlers({
	mousedown(event, view) {
		const session = view.state.field(sessionField, false);
		const pos = session ? view.posAtCoords({ x: event.clientX, y: event.clientY }) : null;
		if (!session || pos === null) return false;
		const hit = session.ranges.find((r) => r.from <= pos && r.to >= pos);
		if (!hit || hit.field === session.active) return false;
		view.dispatch({
			selection: session.selection(hit.field),
			effects: setSession.of(hit.field < session.last ? new Session(session.ranges, hit.field) : null),
			scrollIntoView: true
		});
		return true;
	}
});

const placeTheme = EditorView.baseTheme({
	'&light .cm-snippetField': { backgroundColor: '#00000022' },
	'&dark .cm-snippetField': { backgroundColor: '#ffffff22' },
	'.cm-snippetFieldPosition': {
		verticalAlign: 'text-top',
		width: 0,
		height: '1.15em',
		display: 'inline-block',
		margin: '0 -0.7px -.7em',
		borderLeft: '1.4px dotted #888'
	}
});

/** the session, its keys over everything but codemirror's own snippet keys, which only act on their own session */
export const snippetSession: Extension = [
	sessionField,
	Prec.highest(
		keymap.of([
			{ key: 'Tab', run: moveField(1), shift: moveField(-1) },
			{ key: 'Escape', run: endSession }
		])
	),
	clickIntoPlace,
	placeTheme
];

export function startSnippetSession(state: EditorState, ranges: SnippetFieldRange[]): StateEffect<unknown>[] {
	const effects: StateEffect<unknown>[] = [setSession.of(new Session(ranges, 0))];
	if (state.field(sessionField, false) === undefined) effects.push(StateEffect.appendConfig.of(snippetSession));
	return effects;
}

/** a snippet's places are still being filled in, ours or one of codemirror's completion snippets */
export function inSnippet(state: EditorState): boolean {
	return !!state.field(sessionField, false) || hasNextSnippetField(state) || hasPrevSnippetField(state);
}

/** Tab still has a place to go to */
export function hasNextPlace(state: EditorState): boolean {
	const session = state.field(sessionField, false);
	return session ? session.active < session.last : hasNextSnippetField(state);
}
