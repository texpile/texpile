import type { Node } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';
import type { Decoration, EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import TableWrapperComponent from './TableWrapperComponent.svelte';
import { m } from '$lib/paraglide/messages';
import { offerBlockSettings, settingsPlace, type GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { compiledNumbersOf } from '$lib/editor/visual/extensions/nodeNumbers';
import { announceLabelRenamed, repointRefs } from '$lib/editor/visual/repointRefs';
import { tableLookOf, type TableLines } from './rules/tableRules';
import { withColumnSizes } from './columns/typstColumnSizes';
import { centeredTableOf } from './bare/tableFloat';

/** which markup language the wrapper edits; typst hides every LaTeX-only control
 * (notes, colspec model, row rules, spanning) and never writes tex concepts into the doc. */
export type TableDialect = 'latex' | 'typst';

function isLabelDuplicate(view: EditorView, label: string | null, currentPos: number): boolean {
	// against every anchor, not only other tables: a name shared with a figure is just as ambiguous
	return labelTaken(view.state.doc, label ?? '', currentPos);
}

function getTableNumber(view: EditorView, pos: number): number {
	let count = 0;

	view.state.doc.nodesBetween(0, pos, (node) => {
		if (node.type.name === 'table_wrapper') {
			count++;
		}
	});

	return count + 1;
}

function getTableNode(tableWrapperNode: Node): Node | null {
	let tableNode: Node | null = null;
	tableWrapperNode.forEach((child) => {
		if (child.type.name === 'table') {
			tableNode = child;
		}
	});
	return tableNode;
}

// the rule before each row (table_row.topRules, e.g. "\hline") plus the rule after the last row
// (table.bottomRules); these drive the editable "Row rules" advanced settings
function collectRowRules(tableWrapperNode: Node): { rowRules: string[]; bottomRule: string } {
	const tableNode = getTableNode(tableWrapperNode);
	const rowRules: string[] = [];
	let bottomRule = '';
	if (tableNode) {
		tableNode.forEach((row) => rowRules.push(String(row.attrs.topRules ?? '')));
		bottomRule = String(tableNode.attrs.bottomRules ?? '');
	}
	return { rowRules, bottomRule };
}

export function tableWrapperView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[]
): NodeView {
	return buildTableWrapperView('latex', node, view, getPos, decorations);
}

/** same view over typSchema's table_wrapper: shared header/caption/label UI, tex-only controls hidden. */
export function typstTableWrapperView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[] = []
): NodeView {
	return buildTableWrapperView('typst', node, view, getPos, decorations);
}

function buildTableWrapperView(
	dialect: TableDialect,
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	initialDecorations: readonly Decoration[]
): NodeView {
	let currentNode = node;
	let decorations = initialDecorations;

	const dom = document.createElement('div');
	dom.className = 'table-wrapper';
	// refs find this table via data-label
	if (currentNode.attrs.label) {
		dom.setAttribute('data-label', currentNode.attrs.label);
	}

	const componentContainer = document.createElement('div');
	componentContainer.contentEditable = 'false';
	dom.appendChild(componentContainer);

	const contentEl = document.createElement('div');
	contentEl.className = 'table-wrapper-content';

	function updateClasses() {
		if (currentNode.attrs.showNotes) {
			contentEl.classList.remove('hide-notes');
		} else {
			contentEl.classList.add('hide-notes');
		}
	}
	updateClasses();

	dom.appendChild(contentEl);

	function updateAttrs(attrs: Partial<typeof node.attrs>) {
		const pos = getPos();
		if (pos !== undefined) {
			const tr = view.state.tr.setNodeMarkup(pos, undefined, {
				...currentNode.attrs,
				...attrs
			});
			// renaming the label follows every reference to it, in the same transaction (one undo
			// step). Both dialects: a \ref left behind still compiles, resolving to ??.
			const renamedFrom = 'label' in attrs ? String(currentNode.attrs.label ?? '') : null;
			if (renamedFrom !== null) repointRefs(tr, view.state.doc, renamedFrom, String(attrs.label ?? ''));
			// the notes section is there while its switch is on: hidden notes would print and take the caret unseen
			const notes = currentNode.lastChild?.type.name === 'table_notes' ? currentNode.lastChild : null;
			const end = pos + currentNode.nodeSize - 1;
			if (attrs.showNotes === true && !notes) tr.insert(end, view.state.schema.nodes.table_notes.create());
			if (attrs.showNotes === false && notes) tr.delete(end - notes.nodeSize, end);
			view.dispatch(tr);
			if (renamedFrom !== null) announceLabelRenamed(renamedFrom, String(attrs.label ?? ''));
		}
	}

	// absolute position of the inner `table` node, for editing its rows' rule attrs
	function getTableAbsPos(): number | null {
		const pos = getPos();
		if (pos === undefined) return null;
		let tableAbs: number | null = null;
		currentNode.forEach((child, childOffset) => {
			if (child.type.name === 'table') tableAbs = pos + 1 + childOffset;
		});
		return tableAbs;
	}

	// push the latest row-rule strings into the component after an edit (immediate feedback)
	function refreshRowRules() {
		const pos = getPos();
		if (pos === undefined) return;
		const updated = view.state.doc.nodeAt(pos);
		if (updated) {
			const r = collectRowRules(updated);
			componentProps.rowRules = r.rowRules;
			componentProps.bottomRule = r.bottomRule;
		}
	}

	function setRowRule(rowIndex: number, rule: string) {
		const tableAbs = getTableAbsPos();
		const tableNode = tableAbs === null ? null : view.state.doc.nodeAt(tableAbs);
		if (tableAbs === null || !tableNode) return;
		let rowAbs: number | null = null;
		let idx = 0;
		tableNode.forEach((_row, offset) => {
			if (idx === rowIndex) rowAbs = tableAbs + 1 + offset;
			idx++;
		});
		if (rowAbs === null) return;
		const row = view.state.doc.nodeAt(rowAbs);
		if (!row) return;
		view.dispatch(view.state.tr.setNodeMarkup(rowAbs, undefined, { ...row.attrs, topRules: rule }));
		refreshRowRules();
	}

	function setBottomRule(rule: string) {
		const tableAbs = getTableAbsPos();
		const tableNode = tableAbs === null ? null : view.state.doc.nodeAt(tableAbs);
		if (tableAbs === null || !tableNode) return;
		view.dispatch(view.state.tr.setNodeMarkup(tableAbs, undefined, { ...tableNode.attrs, bottomRules: rule }));
		refreshRowRules();
	}

	function colspecOf(wrapper: Node): string {
		return String(getTableNode(wrapper)?.attrs.colspec ?? '');
	}
	function envOf(wrapper: Node): string {
		return String(getTableNode(wrapper)?.attrs.env ?? 'tabular');
	}
	function setColspec(spec: string) {
		const tableAbs = getTableAbsPos();
		const tableNode = tableAbs === null ? null : view.state.doc.nodeAt(tableAbs);
		if (tableAbs === null || !tableNode) return;
		// a LaTeX spec also pins env: an editor-made table with none becomes a plain tabular carrying the spec
		view.dispatch(
			dialect === 'latex'
				? view.state.tr.setNodeMarkup(tableAbs, undefined, { ...tableNode.attrs, colspec: spec, env: tableNode.attrs.env ?? 'tabular' })
				: withColumnSizes(view.state.tr, tableAbs, spec)
		);
		const pos = getPos();
		const updated = pos !== undefined ? view.state.doc.nodeAt(pos) : null;
		if (updated) componentProps.colspec = colspecOf(updated);
	}

	function setAlign(align: string | null) {
		const tableAbs = getTableAbsPos();
		const tableNode = tableAbs === null ? null : view.state.doc.nodeAt(tableAbs);
		if (tableAbs === null || !tableNode) return;
		view.dispatch(view.state.tr.setNodeMarkup(tableAbs, undefined, { ...tableNode.attrs, typAlign: align }));
	}

	function linesOf(wrapper: Node): TableLines | null {
		const table = getTableNode(wrapper);
		return table ? (tableLookOf(view.state)?.linesOf(table) ?? null) : null;
	}
	function setLines(lines: TableLines) {
		const tableAbs = getTableAbsPos();
		if (tableAbs !== null) tableLookOf(view.state)?.setLines(view, tableAbs, lines);
	}

	// a number handed on the decorations is drawn as given, none included; Typst counts its own until a compile hands them
	function calculateTableData(): { tableNumber: string | null } {
		const handed = compiledNumbersOf(decorations);
		if (handed || dialect === 'latex') return { tableNumber: handed?.[0] ?? null };
		const pos = getPos();
		return { tableNumber: String(pos === undefined ? 1 : getTableNumber(view, pos)) };
	}

	function checkDuplicate(label: string) {
		const pos = getPos();
		if (pos === undefined) return false;
		return isLabelDuplicate(view, label, pos);
	}

	function dropCaption() {
		const pos = getPos();
		const table = getTableNode(currentNode);
		if (pos === undefined || !table) return;
		const before = typeof currentNode.attrs.preBody === 'string' ? currentNode.attrs.preBody : '';
		const tr = view.state.tr.replaceWith(pos, pos + currentNode.nodeSize, centeredTableOf(view.state.schema, table, dialect, before));
		// the table is the block's last child
		const inTable = pos + tr.doc.nodeAt(pos)!.nodeSize - table.nodeSize;
		view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(inTable), 1)).scrollIntoView());
		view.focus();
	}

	// the caption's prefix, Table 1: as it prints (TableWrapperComponent's styles draw it)
	function showNumber(number: string | null) {
		dom.style.setProperty('--table-prefix', JSON.stringify(`${m.tablewrap_table_display({ number: number ?? '' }).trim()}: `));
	}

	const initialData = calculateTableData();
	showNumber(initialData.tableNumber);

	// $state so prop mutations reach the component (svelte 5)
	const initialRules = collectRowRules(currentNode);
	const componentProps = $state({
		dialect,
		node: currentNode,
		updateAttrs,
		checkDuplicate,
		rowRules: initialRules.rowRules,
		bottomRule: initialRules.bottomRule,
		setRowRule,
		setBottomRule,
		colspec: colspecOf(currentNode),
		tableEnv: envOf(currentNode),
		setColspec,
		setAlign,
		lines: linesOf(currentNode),
		setLines,
		dropCaption
	});

	const component = mount(TableWrapperComponent, {
		target: componentContainer,
		props: componentProps
	});
	const withdrawSettings = offerBlockSettings(dom, {
		label: () => m.tablewrap_settings_button(),
		open: (gear) => (component as { open?: (at: GearPlace | null) => void }).open?.(settingsPlace(dom, gear))
	});

	let lastTableData = initialData;

	return {
		dom,
		contentDOM: contentEl,
		update(newNode, newDecorations) {
			if (newNode.type !== node.type) return false;
			currentNode = newNode;
			decorations = newDecorations;

			if (currentNode.attrs.label) {
				dom.setAttribute('data-label', currentNode.attrs.label);
			} else {
				dom.removeAttribute('data-label');
			}

			const newTableData = calculateTableData();
			if (newTableData.tableNumber !== lastTableData.tableNumber) {
				lastTableData = newTableData;
				showNumber(newTableData.tableNumber);
			}

			// always update node so caption validation stays reactive
			componentProps.node = currentNode;

			// keep the editable row-rule list + column spec in sync (rows/columns added/removed, etc.)
			const rules = collectRowRules(currentNode);
			componentProps.rowRules = rules.rowRules;
			componentProps.bottomRule = rules.bottomRule;
			componentProps.colspec = colspecOf(currentNode);
			componentProps.tableEnv = envOf(currentNode);
			componentProps.lines = linesOf(currentNode);

			updateClasses();
			return true;
		},
		destroy() {
			withdrawSettings();
			unmount(component);
		},
		// ignore DOM mutations from the svelte component (popover portals, etc.); PM still
		// handles mutations in contentDOM
		ignoreMutation(mutation) {
			if (componentContainer.contains(mutation.target)) {
				return true;
			}
			if (mutation.target === componentContainer) {
				return true;
			}
			return false;
		},
		// keep events inside the settings UI
		stopEvent(event) {
			const target = event.target;
			if (target instanceof HTMLElement && componentContainer.contains(target)) {
				return true;
			}
			return false;
		}
	};
}
