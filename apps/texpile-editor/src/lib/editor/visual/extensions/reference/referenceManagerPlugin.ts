import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { hideReferencePicker, selectReferenceAt, showReferencePicker } from './referencePicker.svelte';
import type { TexpileSuggester } from '../suggest/texpile-suggest';
import {
	convertBibliographyToReferenceItems,
	extractEquationReferences,
	extractFigureReferences,
	extractSectionReferences,
	extractTableReferences,
	filterReferences,
	type ReferenceItem
} from './referenceItems';

export type { ReferenceItem, ReferenceItemMeta } from './referenceItems';

let selectedIndex = 0;
let referenceList: ReferenceItem[] = [];
let currentView: EditorView | null = null;
let currentRange: { from: number; to: number } | null = null;

const suggestReference: TexpileSuggester = {
	char: '@',
	name: 'reference-manager',
	supportedCharacters: /[a-zA-Z0-9\s_]/,
	maxQueryLength: 30,
	suggestClassName:
		'bg-primary-tint text-primary-ink rounded-base px-0.5 underline decoration-wavy decoration-primary-500 dark:decoration-primary-400',
	onChange: (params) => {
		const { query, range, view } = params;

		currentView = view;
		currentRange = range;

		const features = templateFeaturesStore.current;
		const citationsEnabled = features?.citations ?? true;

		const citations = referenceStore.current || [];
		const bibliographyItems = citationsEnabled ? convertBibliographyToReferenceItems(citations) : [];
		const tableItems = extractTableReferences(view);
		const figureItems = extractFigureReferences(view);
		const equationItems = extractEquationReferences(view);
		const sectionItems = extractSectionReferences(view);

		const allReferences = [...bibliographyItems, ...tableItems, ...figureItems, ...equationItems, ...sectionItems];

		referenceList = filterReferences(allReferences, query.full);
		selectedIndex = 0;

		showReferencePicker(view, range.from, referenceList, query.full, handleReferenceSelection);
	},

	onExit: (_params) => {
		hideDropdown();
	}
};

const keymapPlugin = keymap({
	ArrowDown: () => {
		if (referenceList.length > 0) {
			selectedIndex = (selectedIndex + 1) % referenceList.length;
			selectReferenceAt(selectedIndex);
			return true;
		}
		return false;
	},
	ArrowUp: () => {
		if (referenceList.length > 0) {
			selectedIndex = (selectedIndex - 1 + referenceList.length) % referenceList.length;
			selectReferenceAt(selectedIndex);
			return true;
		}
		return false;
	},
	Enter: (_state, _dispatch) => {
		if (referenceList.length > 0 && currentView) {
			handleReferenceSelection(referenceList[selectedIndex]);
			return true;
		}
		return false;
	},
	Escape: () => {
		if (referenceList.length > 0) {
			hideDropdown();
			return true;
		}
		return false;
	}
});

function handleReferenceSelection(item: ReferenceItem) {
	if (!currentView || !currentRange) return;

	const state = currentView.state;
	const tr = state.tr;
	const { schema } = state;

	// the typst editor's single ref atom covers citations and cross-refs alike; the tex editor
	// keeps its citation/ref split. The check keys off the mounted schema, so tex nodes can
	// never land in a typst doc or vice versa.
	const refNode = schema.nodes.typ_ref
		? schema.nodes.typ_ref.create({ target: item.id })
		: item.type === 'bibliography'
			? // \cite, not \autocite: \autocite needs biblatex, so the menu was inserting an undefined
				// command into every natbib or plain-bibtex document. \cite compiles under all of them.
				schema.nodes.citation.create({ prenote: '', postnote: '', variant: 'cite' }, schema.text(item.id))
			: // a section ref resolves through its label, not through refType, so it takes the
				// general type - there is no section counter for the kind-specific walk to count
				schema.nodes.ref.create({ refType: item.type === 'section' ? 'reference' : item.type }, schema.text(item.id));

	// insert first (shifts positions), then walk back to find and delete the @query text
	tr.insert(state.selection.from, refNode);

	const $from = state.selection.$from;
	let atPosition = $from.pos;
	while (atPosition > $from.start() && state.doc.textBetween(atPosition - 1, atPosition) !== '@') {
		atPosition--;
	}
	if (state.doc.textBetween(atPosition - 1, atPosition) === '@') {
		tr.delete(atPosition - 1, $from.pos);
	}

	currentView.dispatch(tr);
	hideDropdown();
}

function hideDropdown() {
	hideReferencePicker();
	referenceList = [];
	selectedIndex = 0;
	currentView = null;
	currentRange = null;
}

export { suggestReference, keymapPlugin };
