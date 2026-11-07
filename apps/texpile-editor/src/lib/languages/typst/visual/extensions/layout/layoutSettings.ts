// the panel a layout call opens: one set of fields per call, or the call's Typst when it has none
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readTypstCall } from '../../core/reading/typstCall';
import TypstLayoutSettings from './TypstLayoutSettings.svelte';

export function layoutSettings(source: string): ChipSettings | null {
	const call = readTypstCall(source);
	return call && call.form === 'call' ? TypstLayoutSettings : null;
}
