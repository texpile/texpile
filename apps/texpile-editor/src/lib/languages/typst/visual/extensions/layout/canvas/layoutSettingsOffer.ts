// a layout call's settings from the handle's gear: its call, as fields or as Typst; a table alone in #align opens the
// table's settings with the alignment among them
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockSettingsOffer } from '$lib/editor/canvas';
import { gearPlaceAt } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { openBlockHeadPanel, type BlockHead } from '$lib/editor/visual/extensions/drawnChips/chipPanel/blockHeadPanel';
import { openBareTableSettings, type TableHolder } from '$lib/editor/visual/extensions/table/bare/bareTableSettingsPlugin.svelte';
import { m } from '$lib/paraglide/messages';
import { readTypstCall } from '../../../core/reading/typstCall';
import { argsFromField, envHeadReadsBack } from '../../env/envHeadEdits';
import { alignSideOf, layoutAttrsFor, layoutHeadSource, layoutKindOf, withHorizontal } from '../layoutDrawing';
import { firstPositionalValue, withFirstPositional } from '../layoutEdits';
import { layoutSettings } from '../layoutSettings';

function attrsForHead(node: PMNode, next: string): PMNode['attrs'] | null {
	const call = readTypstCall(next);
	if (!call || call.open === null || call.close === null) return null;
	const named = next.slice(call.open + 1, call.close);
	const grid = node.type.name === 'typ_grid';
	const args = grid ? named : argsFromField(named, typeof node.attrs.args === 'string' ? node.attrs.args : null);
	if (!grid && !envHeadReadsBack(call.name, args)) return null;
	return layoutAttrsFor(node, call.name, args);
}

const LAYOUT_HEAD: BlockHead = {
	language: 'typst',
	holds: (node) => layoutKindOf(node) !== null,
	source: layoutHeadSource,
	settingsFor: layoutSettings,
	attrsFor: attrsForHead
};

function alignmentOf(node: PMNode): string {
	const call = readTypstCall(layoutHeadSource(node));
	return call ? firstPositionalValue(call) : '';
}

function holdsOnlyTable(node: PMNode): boolean {
	return layoutKindOf(node) === 'align' && node.childCount === 1 && node.firstChild!.type.name === 'table';
}

function tableHolder(pos: number): TableHolder {
	return {
		pos,
		sideOf: alignSideOf,
		withSide(holder, side) {
			const next = withFirstPositional(layoutHeadSource(holder), withHorizontal(alignmentOf(holder), side));
			return next ? attrsForHead(holder, next) : null;
		}
	};
}

export const LAYOUT_SETTINGS: BlockSettingsOffer = {
	offers: (node) => layoutKindOf(node) !== null,
	label: (node) => (holdsOnlyTable(node) ? m.tablewrap_settings_button() : m.typ_layout_settings()),
	forOnlyChild: holdsOnlyTable,
	open(pos, view, gear) {
		const node = view.state.doc.nodeAt(pos);
		const place = gearPlaceAt(view, pos, gear);
		if (!node || !place) return;
		if (holdsOnlyTable(node)) openBareTableSettings({ view, pos: pos + 1, dialect: 'typst', place, holder: tableHolder(pos) });
		else openBlockHeadPanel(view, pos, place, LAYOUT_HEAD);
	}
};
