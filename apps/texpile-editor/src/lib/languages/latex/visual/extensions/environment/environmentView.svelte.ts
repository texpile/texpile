import type { Node } from 'prosemirror-model';
import type { Decoration, EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel
} from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { gearPlaceBeside, markGearPlace, offerBlockSettings } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import {
	openBareTableSettings,
	type TableHolder,
	type TableSide
} from '$lib/editor/visual/extensions/table/bare/bareTableSettingsPlugin.svelte';
import { m } from '$lib/paraglide/messages';
import EnvironmentHead from './EnvironmentHead.svelte';
import EnvironmentAlignSetting from './EnvironmentAlignSetting.svelte';
import { environmentHeadSource, readEnvironmentHead } from './environmentHeadSource';
import { environmentLook } from './environmentLook';
import './environment.css';

const SIDE_OF: Record<string, TableSide> = { flushleft: 'left', center: 'center', flushright: 'right' };
const ENVIRONMENT_OF: Record<TableSide, string> = { left: 'flushleft', center: 'center', right: 'flushright' };

function numberOf(decorations: readonly Decoration[]): string | null {
	const numbers = decorations.find((d) => (d.spec as { numbers?: string[] }).numbers)?.spec.numbers as string[] | undefined;
	return numbers?.[0] ?? null;
}

export function environmentView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[] = []
): NodeView {
	let currentNode = node;

	const dom = document.createElement('div');
	dom.className = 'tex-environment';
	dom.setAttribute('data-env', String(node.attrs.name ?? 'environment'));

	const header = document.createElement('div');
	header.className = 'env-header';
	header.contentEditable = 'false';
	dom.appendChild(header);

	const contentDom = document.createElement('div');
	contentDom.className = 'tex-environment-body';
	dom.appendChild(contentDom);

	// where the handle's gear stood, for the panel it opens to keep to
	const gearPlace = document.createElement('span');
	gearPlace.className = 'env-gear-place';
	gearPlace.contentEditable = 'false';
	dom.appendChild(gearPlace);
	let panelAnchor: HTMLElement = header;

	function writeHead(next: string) {
		const pos = getPos();
		const head = readEnvironmentHead(next);
		if (pos === undefined || !head) return;
		if (head.name === currentNode.attrs.name && head.args === (currentNode.attrs.args ?? '')) return;
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, ...head }));
	}

	// an alignment is chosen, any other environment's first line is retyped
	function settingsFor(source: string) {
		const head = readEnvironmentHead(source);
		return head && environmentLook(head.name, head.args, undefined).kind === 'align' ? EnvironmentAlignSetting : null;
	}

	function openSettings(anchor: HTMLElement = header) {
		if (chipPanelOpenFor(anchor)) return;
		panelAnchor = anchor;
		openChipPanel({
			anchor,
			source: environmentHeadSource(currentNode),
			language: 'latex',
			inline: false,
			settingsFor,
			write: writeHead,
			writeSetting: writeHead,
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => {
				if (how !== 'away') view.focus();
			}
		});
	}

	const props = $state({ node: currentNode, onopen: () => openSettings(), number: numberOf(decorations) });
	const component = mount(EnvironmentHead, { target: header, props });
	function tableHolder(pos: number): TableHolder {
		return {
			pos,
			sideOf: (environment) => SIDE_OF[String(environment.attrs.name)] ?? null,
			withSide: (environment, side) => ({ ...environment.attrs, name: ENVIRONMENT_OF[side] })
		};
	}
	// a table alone in center is a table to its writer: its settings open, with the alignment among them
	function holdsOnlyTable(): boolean {
		const look = environmentLook(String(currentNode.attrs.name ?? ''), String(currentNode.attrs.args ?? ''), undefined);
		return look.kind === 'align' && currentNode.childCount === 1 && currentNode.firstChild!.type.name === 'table';
	}
	const withdrawSettings = offerBlockSettings(dom, {
		label: () => (holdsOnlyTable() ? m.tablewrap_settings_button() : m.env_settings_button_label()),
		open(gear) {
			const pos = getPos();
			if (holdsOnlyTable() && pos !== undefined) {
				openBareTableSettings({ view, pos: pos + 1, dialect: 'latex', place: gearPlaceBeside(dom, gear), holder: tableHolder(pos) });
				return;
			}
			markGearPlace(gearPlace, dom, gear);
			openSettings(gearPlace);
		}
	});

	return {
		dom,
		contentDOM: contentDom,
		update(newNode, newDecorations) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			props.node = newNode;
			props.number = numberOf(newDecorations);
			if (chipPanelOpenFor(panelAnchor)) syncChipPanel(panelAnchor, environmentHeadSource(newNode));
			dom.setAttribute('data-env', String(newNode.attrs.name ?? 'environment'));
			return true;
		},
		// ignore mutations inside the svelte header, PM owns the body
		ignoreMutation(mutation) {
			return header.contains(mutation.target as HTMLElement) || mutation.target === header || mutation.target === gearPlace;
		},
		stopEvent(event) {
			const t = event.target;
			return t instanceof HTMLElement && header.contains(t);
		},
		destroy() {
			withdrawSettings();
			dismissChipPanel(panelAnchor);
			unmount(component);
		}
	};
}
