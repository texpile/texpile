// what a drawn chip's panel needs from the chip's language: its settings, how an edit is read again, where its names lead
import type { ChipReparse } from './chipReparse';
import type { ChipPanelAction, ChipPanelFooter, ChipSettings } from './chipPanel/chipPanel.svelte';

export type DrawnChipKind = {
	block: boolean;
	language: 'latex' | 'typst';
	reparse: ChipReparse;
	/** the settings the panel shows instead of the chip's LaTeX, when the chip is one command they can hold exactly */
	settingsFor(source: string): ChipSettings | null;
	jump(label: string): void;
	jumpToDefinition(name: string): void;
	footerFor?(source: string): ChipPanelFooter | null;
	caretFor?(source: string): number | undefined;
	actionFor?(source: string, pos: number): ChipPanelAction | null;
};
