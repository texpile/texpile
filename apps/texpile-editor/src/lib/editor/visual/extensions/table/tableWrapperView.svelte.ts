import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import TableWrapperComponent from './TableWrapperComponent.svelte';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { repointRefs } from '$lib/editor/visual/repointRefs';

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

export function tableWrapperView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	return buildTableWrapperView('latex', node, view, getPos);
}

/** same view over typSchema's table_wrapper: shared header/caption/label UI, tex-only controls hidden. */
export function typstTableWrapperView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	return buildTableWrapperView('typst', node, view, getPos);
}

function buildTableWrapperView(dialect: TableDialect, node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	let currentNode = node;

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
			if ('label' in attrs) repointRefs(tr, view.state.doc, String(currentNode.attrs.label ?? ''), String(attrs.label ?? ''));
			view.dispatch(tr);
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
		// setting a spec also pins env (the serializer's faithful path needs both); an editor-created
		// table with no env becomes a plain tabular carrying the user's spec. typst has no env: its
		// colspec is the verbatim `columns:` value, and the serializer count-guards it on its own
		view.dispatch(
			view.state.tr.setNodeMarkup(
				tableAbs,
				undefined,
				dialect === 'latex'
					? { ...tableNode.attrs, colspec: spec, env: tableNode.attrs.env ?? 'tabular' }
					: { ...tableNode.attrs, colspec: spec }
			)
		);
		const pos = getPos();
		const updated = pos !== undefined ? view.state.doc.nodeAt(pos) : null;
		if (updated) componentProps.colspec = colspecOf(updated);
	}

	function calculateTableData() {
		const pos = getPos();
		if (pos === undefined) return { tableNumber: 1 };

		return { tableNumber: getTableNumber(view, pos) };
	}

	function checkDuplicate(label: string) {
		const pos = getPos();
		if (pos === undefined) return false;
		return isLabelDuplicate(view, label, pos);
	}

	const initialData = calculateTableData();

	// $state so prop mutations reach the component (svelte 5)
	const initialRules = collectRowRules(currentNode);
	const componentProps = $state({
		dialect,
		tableNumber: initialData.tableNumber,
		node: currentNode,
		updateAttrs,
		checkDuplicate,
		rowRules: initialRules.rowRules,
		bottomRule: initialRules.bottomRule,
		setRowRule,
		setBottomRule,
		colspec: colspecOf(currentNode),
		tableEnv: envOf(currentNode),
		setColspec
	});

	const component = mount(TableWrapperComponent, {
		target: componentContainer,
		props: componentProps
	});

	let lastTableData = initialData;

	return {
		dom,
		contentDOM: contentEl,
		update(newNode) {
			if (newNode.type !== node.type) return false;
			currentNode = newNode;

			if (currentNode.attrs.label) {
				dom.setAttribute('data-label', currentNode.attrs.label);
			} else {
				dom.removeAttribute('data-label');
			}

			const newTableData = calculateTableData();
			if (newTableData.tableNumber !== lastTableData.tableNumber) {
				lastTableData = newTableData;
				componentProps.tableNumber = newTableData.tableNumber;
			}

			// always update node so caption validation stays reactive
			componentProps.node = currentNode;

			// keep the editable row-rule list + column spec in sync (rows/columns added/removed, etc.)
			const rules = collectRowRules(currentNode);
			componentProps.rowRules = rules.rowRules;
			componentProps.bottomRule = rules.bottomRule;
			componentProps.colspec = colspecOf(currentNode);
			componentProps.tableEnv = envOf(currentNode);

			updateClasses();
			return true;
		},
		destroy() {
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
