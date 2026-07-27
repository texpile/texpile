// custom CM search panel cloning the visual editor's find bar (SearchBar.svelte). CM's default
// panel can't be CSS'd into that shape, so it's replaced via search({ createPanel }). uses the
// same skeleton utility classes as SearchBar.svelte so the two bars stay consistent by construction.
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';
import {
	search,
	SearchQuery,
	setSearchQuery,
	getSearchQuery,
	findNext,
	findPrevious,
	replaceNext,
	replaceAll,
	closeSearchPanel
} from '@codemirror/search';
import { trailingDebounce } from '$lib/trailingDebounce';

// lucide glyphs inlined: this panel is plain DOM, not svelte, so the icon components can't be used
const svg = (paths: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON_PREV = svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');
const ICON_NEXT = svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');
const ICON_CLOSE = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
const ICON_REPLACE = svg(
	'<path d="M14 4a2 2 0 0 1 2-2"/><path d="M16 10a2 2 0 0 1-2-2"/><path d="M20 2a2 2 0 0 1 2 2"/><path d="M22 8a2 2 0 0 1-2 2"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a3 3 0 0 1 3-3h1"/><rect x="2" y="14" width="8" height="8" rx="2"/>'
);

class TexpileSearchPanel implements Panel {
	dom: HTMLElement;
	top = true;
	private searchField: HTMLInputElement;
	private replaceField: HTMLInputElement;
	private countBadge: HTMLElement;
	private replaceRow: HTMLElement;
	// recount walks the whole doc; per-keystroke/cursor-move it froze big buffers, so the badge
	// trails edits by a beat instead. isConnected: don't rescan for a panel that's been closed.
	private deferredRecount = trailingDebounce<void>(200, () => {
		if (this.dom.isConnected) this.recount();
	});

	constructor(private view: EditorView) {
		this.dom = document.createElement('div');
		this.dom.className = 'texpile-cm-search flex flex-col gap-2 p-2';

		// row 1: mirrors SearchBar.svelte (input, count badge, prev, next, close)
		const row = document.createElement('div');
		row.className = 'flex items-center gap-2';

		this.searchField = document.createElement('input');
		this.searchField.type = 'text';
		this.searchField.placeholder = 'Search…';
		this.searchField.className = 'input w-56';
		this.searchField.setAttribute('main-field', 'true'); // Mod-F while open refocuses this field
		this.searchField.addEventListener('input', () => this.commit());
		this.searchField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				(e.shiftKey ? findPrevious : findNext)(this.view);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				closeSearchPanel(this.view);
				this.view.focus();
			}
		});

		this.countBadge = document.createElement('span');
		this.countBadge.className = 'badge preset-filled-surface-200-800 min-w-[3.5rem] text-center';
		this.countBadge.textContent = '0/0';

		const btn = (icon: string, label: string, onClick: () => void) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'btn-icon btn-icon-sm hover:preset-tonal';
			b.setAttribute('aria-label', label);
			b.title = label;
			b.innerHTML = icon;
			// keep focus in the search field while stepping through matches
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', onClick);
			return b;
		};

		const replaceToggle = btn(ICON_REPLACE, 'Toggle replace', () => {
			this.replaceRow.classList.toggle('hidden');
			replaceToggle.classList.toggle('preset-tonal-primary', !this.replaceRow.classList.contains('hidden'));
			if (!this.replaceRow.classList.contains('hidden')) this.replaceField.focus();
		});

		row.append(
			this.searchField,
			this.countBadge,
			btn(ICON_PREV, 'Previous match', () => findPrevious(this.view)),
			btn(ICON_NEXT, 'Next match', () => findNext(this.view)),
			replaceToggle,
			btn(ICON_CLOSE, 'Close search', () => {
				closeSearchPanel(this.view);
				this.view.focus();
			})
		);

		// row 2 (hidden until toggled): replace input + Replace / All
		this.replaceRow = document.createElement('div');
		this.replaceRow.className = 'hidden flex items-center gap-2';

		this.replaceField = document.createElement('input');
		this.replaceField.type = 'text';
		this.replaceField.placeholder = 'Replace with…';
		this.replaceField.className = 'input w-56';
		this.replaceField.addEventListener('input', () => this.commit());
		this.replaceField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				replaceNext(this.view);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				closeSearchPanel(this.view);
				this.view.focus();
			}
		});

		const textBtn = (label: string, title: string, onClick: () => void) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'btn btn-sm hover:preset-tonal';
			b.textContent = label;
			b.title = title;
			b.addEventListener('mousedown', (e) => e.preventDefault());
			b.addEventListener('click', onClick);
			return b;
		};
		this.replaceRow.append(
			this.replaceField,
			textBtn('Replace', 'Replace this match', () => replaceNext(this.view)),
			textBtn('All', 'Replace all matches', () => replaceAll(this.view))
		);

		this.dom.append(row, this.replaceRow);

		// seed from any existing query, so reopening the panel keeps the last search
		const existing = getSearchQuery(view.state);
		if (existing.search) {
			this.searchField.value = existing.search;
			this.replaceField.value = existing.replace ?? '';
		}
	}

	/** push the fields into CM's search state (highlights every match) and refresh the count. */
	private commit() {
		this.view.dispatch({
			effects: setSearchQuery.of(
				new SearchQuery({ search: this.searchField.value, replace: this.replaceField.value, caseSensitive: false })
			)
		});
		this.recount();
	}

	/** "current/total" like the PM bar. full scan is fine at source-file sizes, panel-open only. */
	private recount() {
		const query = getSearchQuery(this.view.state);
		let total = 0;
		let current = 0;
		if (query.search) {
			const selFrom = this.view.state.selection.main.from;
			const cursor = query.getCursor(this.view.state.doc);
			for (let m = cursor.next(); !m.done; m = cursor.next()) {
				total++;
				if (m.value.from <= selFrom) current = total;
			}
		}
		this.countBadge.textContent = `${current}/${total}`;
	}

	update(update: ViewUpdate) {
		// selectionSet matters too: the "current" index follows the cursor, so it also goes through
		// the debounce rather than rescanning on every arrow key
		if (update.docChanged || update.selectionSet) this.deferredRecount();
	}

	mount() {
		this.searchField.focus();
		this.searchField.select();
		this.recount();
	}
}

/** drop-in for `search()`: same keymap/state, PM-look panel floated top-right. */
export function texpileSearch() {
	return search({ top: true, createPanel: (view) => new TexpileSearchPanel(view) });
}
