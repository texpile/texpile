// an environment's settings from the handle's gear or a press on its head: its first line, retyped or, for an alignment,
// chosen; a table alone in center opens the table's settings with the alignment among them
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockSettingsOffer, VisualView } from '$lib/editor/canvas';
import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { gearPlaceAt } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { openBlockHeadPanel, type BlockHead } from '$lib/editor/visual/extensions/drawnChips/chipPanel/blockHeadPanel';
import {
	openBareTableSettings,
	type TableHolder,
	type TableSide
} from '$lib/editor/visual/extensions/table/bare/bareTableSettingsPlugin.svelte';
import { heldTable, type HeldTable } from '$lib/editor/visual/extensions/table/bare/heldTable';
import { m } from '$lib/paraglide/messages';
import EnvironmentAlignSetting from '../EnvironmentAlignSetting.svelte';
import { environmentHeadSource, readEnvironmentHead } from '../environmentHeadSource';
import { environmentLook } from '../environmentLook';

const SIDE_OF: Record<string, TableSide> = { flushleft: 'left', center: 'center', flushright: 'right' };
const ENVIRONMENT_OF: Record<TableSide, string> = { left: 'flushleft', center: 'center', right: 'flushright' };

const ENVIRONMENT_HEAD: BlockHead = {
	language: 'latex',
	holds: (node) => node.type.name === 'environment',
	source: environmentHeadSource,
	// an alignment is chosen, any other environment's first line is retyped
	settingsFor(source) {
		const head = readEnvironmentHead(source);
		return head && environmentLook(head.name, head.args, undefined).kind === 'align' ? EnvironmentAlignSetting : null;
	},
	attrsFor(node, next) {
		const head = readEnvironmentHead(next);
		return head ? { ...node.attrs, ...head } : null;
	}
};

function tableHeld(node: PMNode): HeldTable | null {
	const look = environmentLook(String(node.attrs.name ?? ''), String(node.attrs.args ?? ''), undefined);
	return look.kind === 'align' ? heldTable(node) : null;
}

function tableHolder(pos: number): TableHolder {
	return {
		pos,
		sideOf: (environment) => SIDE_OF[String(environment.attrs.name)] ?? null,
		withSide: (environment, side) => ({ ...environment.attrs, name: ENVIRONMENT_OF[side] }),
		before: (environment) => heldTable(environment)?.before ?? ''
	};
}

export function openEnvironmentHead(view: VisualView, pos: number, place: GearPlace): void {
	openBlockHeadPanel(view, pos, place, ENVIRONMENT_HEAD);
}

export const ENVIRONMENT_SETTINGS: BlockSettingsOffer = {
	label: (node) => (tableHeld(node) ? m.tablewrap_settings_button() : m.env_settings_button_label()),
	forOnlyChild: (node) => tableHeld(node) !== null,
	open(pos, view, gear) {
		const node = view.state.doc.nodeAt(pos);
		const place = gearPlaceAt(view, pos, gear);
		if (!node || !place) return;
		const held = tableHeld(node);
		if (held) openBareTableSettings({ view, pos: pos + 1 + held.offset, dialect: 'latex', place, holder: tableHolder(pos) });
		else openEnvironmentHead(view, pos, place);
	}
};
