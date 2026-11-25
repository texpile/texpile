// a table float's settings from the handle's gear: caption, label, notes, columns and rules, read off the float as it is
import type { Component } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';
import type { BlockSettingsOffer } from '$lib/editor/canvas';
import { settingsPanelOffer, type PanelProps } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { announceLabelRenamed, repointRefs } from '$lib/editor/visual/repointRefs';
import { m } from '$lib/paraglide/messages';
import TableWrapperComponent from '../TableWrapperComponent.svelte';
import { centeredTableOf } from '../bare/tableFloat';
import { withColumnSizes } from '../columns/typstColumnSizes';
import { tableLookOf, type TableLines } from '../rules/tableRules';

type TableDialect = 'latex' | 'typst';
type WrapperPanelProps = Parameters<typeof TableWrapperComponent>[1];

/** the props TableWrapperComponent takes, each read off the float when the panel reads it */
export function tableWrapperPanelProps(dialect: TableDialect, block: PanelProps): WrapperPanelProps {
	const { view } = block;
	function tablePos(): number | null {
		const at = block.getPos();
		let found: number | null = null;
		if (at !== undefined) block.node.forEach((child, offset) => void (child.type.name === 'table' && (found = at + 1 + offset)));
		return found;
	}
	function table(): PMNode | null {
		const at = tablePos();
		return at === null ? null : view.state.doc.nodeAt(at);
	}
	function setTableAttrs(attrs: Record<string, unknown>): void {
		const at = tablePos();
		const now = table();
		if (at !== null && now) view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...now.attrs, ...attrs }));
	}
	return {
		dialect,
		get node() {
			return block.node;
		},
		updateAttrs(attrs) {
			const pos = block.getPos();
			if (pos === undefined) return;
			const node = block.node;
			const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
			// a renamed label takes its references along in the same undo step
			const renamedFrom = 'label' in attrs ? String(node.attrs.label ?? '') : null;
			if (renamedFrom !== null) repointRefs(tr, view.state.doc, renamedFrom, String(attrs.label ?? ''));
			// the notes section is there while its switch is on: hidden notes would print and take the caret unseen
			const notes = node.lastChild?.type.name === 'table_notes' ? node.lastChild : null;
			const end = pos + node.nodeSize - 1;
			if (attrs.showNotes === true && !notes) tr.insert(end, view.state.schema.nodes.table_notes.create());
			if (attrs.showNotes === false && notes) tr.delete(end - notes.nodeSize, end);
			view.dispatch(tr);
			if (renamedFrom !== null) announceLabelRenamed(renamedFrom, String(attrs.label ?? ''));
		},
		checkDuplicate(label) {
			const pos = block.getPos();
			return pos !== undefined && labelTaken(view.state.doc, label, pos);
		},
		get rowRules() {
			const rules: string[] = [];
			table()?.forEach((row) => rules.push(String(row.attrs.topRules ?? '')));
			return rules;
		},
		get bottomRule() {
			return String(table()?.attrs.bottomRules ?? '');
		},
		setRowRule(rowIndex, rule) {
			const at = tablePos();
			const now = table();
			if (at === null || !now || rowIndex >= now.childCount) return;
			let rowAt = at + 1;
			for (let i = 0; i < rowIndex; i++) rowAt += now.child(i).nodeSize;
			view.dispatch(view.state.tr.setNodeMarkup(rowAt, undefined, { ...now.child(rowIndex).attrs, topRules: rule }));
		},
		setBottomRule: (rule) => setTableAttrs({ bottomRules: rule }),
		get colspec() {
			return String(table()?.attrs.colspec ?? '');
		},
		get tableEnv() {
			return String(table()?.attrs.env ?? 'tabular');
		},
		setColspec(spec) {
			const at = tablePos();
			const now = table();
			if (at === null || !now) return;
			// a LaTeX spec also pins env: an editor-made table with none becomes a plain tabular carrying the spec
			if (dialect === 'latex') setTableAttrs({ colspec: spec, env: now.attrs.env ?? 'tabular' });
			else view.dispatch(withColumnSizes(view.state.tr, at, spec));
		},
		setAlign: (align) => setTableAttrs({ typAlign: align }),
		get lines() {
			const now = table();
			return now ? (tableLookOf(view.state)?.linesOf(now) ?? null) : null;
		},
		setLines(lines: TableLines) {
			const at = tablePos();
			if (at !== null) tableLookOf(view.state)?.setLines(view, at, lines);
		},
		dropCaption() {
			const pos = block.getPos();
			const now = table();
			if (pos === undefined || !now) return;
			const node = block.node;
			const before = typeof node.attrs.preBody === 'string' ? node.attrs.preBody : '';
			const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, centeredTableOf(view.state.schema, now, dialect, before));
			// the table is the block's last child
			const inTable = pos + tr.doc.nodeAt(pos)!.nodeSize - now.nodeSize;
			view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(inTable), 1)).scrollIntoView());
			view.focus();
		}
	};
}

export function tableWrapperSettings(dialect: TableDialect): BlockSettingsOffer {
	return settingsPanelOffer({
		nodeType: 'table_wrapper',
		label: () => m.tablewrap_settings_button(),
		component: TableWrapperComponent as Component<WrapperPanelProps>,
		opener: 'open',
		props: (block) => tableWrapperPanelProps(dialect, block)
	});
}
