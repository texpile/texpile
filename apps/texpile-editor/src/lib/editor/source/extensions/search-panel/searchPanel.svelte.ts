import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';
import { flushSync, mount, unmount } from 'svelte';
import {
	SearchQuery,
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	openSearchPanel,
	replaceAll,
	replaceNext,
	search,
	searchPanelOpen,
	setSearchQuery
} from '@codemirror/search';
import FindBar from '$lib/editor/find/FindBar.svelte';
import { NO_FIND_OPTIONS, toggledFindOption, type FindOptions } from '$lib/editor/find/findOptions';
import { trailingDebounce } from '$lib/trailingDebounce';

type BarProps = {
	query: string;
	replaceText: string;
	options: FindOptions;
	current: number;
	total: number;
	onQueryChange: (value: string) => void;
	onReplaceTextChange: (value: string) => void;
	onToggleOption: (key: keyof FindOptions) => void;
	onPrev: () => void;
	onNext: () => void;
	onReplaceOne: () => void;
	onReplaceAll: () => void;
	onClose: () => void;
};

class TexpileSearchPanel implements Panel {
	dom: HTMLElement;
	top = true;
	// a class field, not a constructor assignment, or it is not a $state proxy and `mount` never
	// sees a later write
	private props: BarProps = $state({
		query: '',
		replaceText: '',
		options: NO_FIND_OPTIONS,
		current: 0,
		total: 0,
		onQueryChange: (value: string) => {
			this.props.query = value;
			this.commit();
		},
		onReplaceTextChange: (value: string) => {
			this.props.replaceText = value;
			this.commit();
		},
		onToggleOption: (key: keyof FindOptions) => {
			this.props.options = toggledFindOption(this.props.options, key);
			this.commit();
		},
		onPrev: () => {
			findPrevious(this.view);
			this.recount();
		},
		onNext: () => {
			findNext(this.view);
			this.recount();
		},
		onReplaceOne: () => {
			replaceNext(this.view);
			this.recount();
		},
		onReplaceAll: () => {
			replaceAll(this.view);
			this.recount();
		},
		onClose: () => {
			closeSearchPanelAnimated(this.view);
			this.view.focus();
		}
	});
	private bar: { focusQuery: () => void };
	// recount walks the whole doc, which froze big buffers per keystroke
	private deferredRecount = trailingDebounce<void>(200, () => {
		if (this.dom.isConnected) this.recount();
	});

	constructor(private view: EditorView) {
		this.dom = document.createElement('div');

		const existing = getSearchQuery(view.state);
		this.props.query = existing.search ?? '';
		this.props.replaceText = existing.replace ?? '';
		this.props.options = {
			caseSensitive: existing.caseSensitive,
			wholeWord: existing.wholeWord,
			regexp: existing.regexp
		};

		this.bar = mount(FindBar, { target: this.dom, props: this.props }) as { focusQuery: () => void };
		flushSync(); // bind:this lands in an effect; CodeMirror calls mount() before a microtask could run it
	}

	private commit(): void {
		this.view.dispatch({
			effects: setSearchQuery.of(new SearchQuery({ search: this.props.query, replace: this.props.replaceText, ...this.props.options }))
		});
		this.recount();
	}

	private recount(): void {
		const query = getSearchQuery(this.view.state);
		let total = 0;
		let current = 0;
		if (query.search && query.valid) {
			const selFrom = this.view.state.selection.main.from;
			const cursor = query.getCursor(this.view.state.doc);
			for (let m = cursor.next(); !m.done; m = cursor.next()) {
				total++;
				if (m.value.from <= selFrom) current = total;
			}
		}
		this.props.total = total;
		this.props.current = current;
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.selectionSet) this.deferredRecount();
	}

	mount(): void {
		this.bar.focusQuery();
		this.recount();
	}

	destroy(): void {
		void unmount(this.bar as never);
	}
}

/** drop-in for `search()`, with the shared find bar as its panel */
const CLOSE_MS = 180; // the visual editor's bar slides for 180ms; the panel matches it both ways

/** slides the panel out, then lets CodeMirror remove it */
export function closeSearchPanelAnimated(view: EditorView): boolean {
	if (!searchPanelOpen(view.state)) return false;
	const panel = view.dom.querySelector('.cm-panels-top');
	if (!panel || panel.classList.contains('closing')) return true;
	panel.classList.add('closing');
	setTimeout(() => closeSearchPanel(view), CLOSE_MS);
	view.focus();
	return true;
}

/** Mod-f: open when closed, close when open, like the visual editor's bar */
export function toggleSearchPanel(view: EditorView): boolean {
	return searchPanelOpen(view.state) ? closeSearchPanelAnimated(view) : openSearchPanel(view);
}

export function texpileSearch() {
	return search({ top: true, createPanel: (view) => new TexpileSearchPanel(view) });
}
