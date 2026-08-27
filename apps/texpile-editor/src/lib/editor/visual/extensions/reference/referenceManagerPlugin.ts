import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { referenceStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { citationRefsWithLibrary } from '$lib/library/libraryRefs';
import { mount, unmount } from 'svelte';
import ReferencePickerDropdown from './ReferencePickerDropdown.svelte';
import type { TexpileSuggester } from '../suggest/texpile-suggest';
import {
	convertBibliographyToReferenceItems,
	extractEquationReferences,
	extractFigureReferences,
	extractTableReferences,
	filterReferences,
	type ReferenceItem
} from './referenceItems';

export type { ReferenceItem, ReferenceItemMeta } from './referenceItems';

let selectedIndex = 0;
let referenceList: ReferenceItem[] = [];
let dropdownComponent: ReturnType<typeof mount> | null = null;
let dropdownContainer: HTMLElement | null = null;
let currentView: EditorView | null = null;
let currentRange: { from: number; to: number } | null = null;

const suggestReference: TexpileSuggester = {
	char: '@',
	name: 'reference-manager',
	supportedCharacters: /[a-zA-Z0-9\s_]/,
	maxQueryLength: 30,
	suggestClassName:
		'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded px-0.5 underline decoration-wavy decoration-primary-500 dark:decoration-primary-400',
	onChange: (params) => {
		const { query, range, view } = params;

		currentView = view;
		currentRange = range;

		const features = templateFeaturesStore.current;
		const citationsEnabled = features?.citations ?? true;

		const citations = citationRefsWithLibrary(referenceStore.current || []);
		const bibliographyItems = citationsEnabled ? convertBibliographyToReferenceItems(citations) : [];
		const tableItems = extractTableReferences(view);
		const figureItems = extractFigureReferences(view);
		const equationItems = extractEquationReferences(view);

		const allReferences = [...bibliographyItems, ...tableItems, ...figureItems, ...equationItems];

		referenceList = filterReferences(allReferences, query.full);
		selectedIndex = 0;

		showDropdown(view, range.from, referenceList, selectedIndex, query.full);
	},

	onExit: (_params) => {
		hideDropdown();
	}
};

const keymapPlugin = keymap({
	ArrowDown: () => {
		if (referenceList.length > 0) {
			selectedIndex = (selectedIndex + 1) % referenceList.length;
			updateDropdown(selectedIndex);
			return true;
		}
		return false;
	},
	ArrowUp: () => {
		if (referenceList.length > 0) {
			selectedIndex = (selectedIndex - 1 + referenceList.length) % referenceList.length;
			updateDropdown(selectedIndex);
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
			? schema.nodes.citation.create({ prenote: '', postnote: '', variant: 'autocite' }, schema.text(item.id))
			: schema.nodes.ref.create({ refType: item.type }, schema.text(item.id));

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

function showDropdown(view: EditorView, pos: number, items: ReferenceItem[], selectedIndex: number, query: string) {
	if (!dropdownContainer) {
		dropdownContainer = document.createElement('div');
		dropdownContainer.className = 'reference-picker-container';
		dropdownContainer.style.position = 'fixed';
		dropdownContainer.style.zIndex = '50';
		document.body.appendChild(dropdownContainer);
	}

	if (dropdownComponent) {
		unmount(dropdownComponent);
	}

	dropdownComponent = mount(ReferencePickerDropdown, {
		target: dropdownContainer,
		props: {
			items,
			selectedIndex,
			query,
			onSelect: handleReferenceSelection
		}
	});

	// coordsAtPos is viewport-relative, so use fixed positioning
	const coords = view.coordsAtPos(pos);
	const windowHeight = window.innerHeight;
	const windowWidth = window.innerWidth;

	// wait a frame so the dropdown has real dimensions
	requestAnimationFrame(() => {
		if (!dropdownContainer) return;
		const dropdownRect = dropdownContainer.getBoundingClientRect();
		const dropdownHeight = dropdownRect.height;
		const dropdownWidth = dropdownRect.width || 384; // fallback to 384px (w-96)

		const spaceBelow = windowHeight - coords.bottom;
		const spaceAbove = coords.top;

		let top: number;
		if (spaceBelow >= dropdownHeight + 4 || spaceBelow >= spaceAbove) {
			top = coords.bottom + 4;
		} else {
			top = coords.top - dropdownHeight - 4;
		}

		let left = coords.left;
		if (left + dropdownWidth > windowWidth) {
			left = windowWidth - dropdownWidth - 10;
		}

		dropdownContainer.style.left = `${left}px`;
		dropdownContainer.style.top = `${top}px`;
	});
}

function updateDropdown(newSelectedIndex: number) {
	if (!dropdownComponent || !dropdownContainer) return;

	// svelte 5 mount props aren't reactive from outside, so remount with new props
	unmount(dropdownComponent);
	dropdownComponent = mount(ReferencePickerDropdown, {
		target: dropdownContainer,
		props: {
			items: referenceList,
			selectedIndex: newSelectedIndex,
			query: '',
			onSelect: handleReferenceSelection
		}
	});
}

function hideDropdown() {
	if (dropdownComponent) {
		unmount(dropdownComponent);
		dropdownComponent = null;
	}
	if (dropdownContainer) {
		dropdownContainer.remove();
		dropdownContainer = null;
	}
	referenceList = [];
	selectedIndex = 0;
	currentView = null;
	currentRange = null;
}

export { suggestReference, keymapPlugin };
