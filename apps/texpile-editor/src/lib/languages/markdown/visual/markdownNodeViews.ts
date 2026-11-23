// the Markdown node views the mount passes to the view (8.7); W14 adds lists, tables and images
import {
	canvasViewProps,
	composeNodeViews,
	coreMarkViews,
	coreNodeViews,
	islandNodeViews,
	mathNodeViews,
	type CanvasViewProps
} from '$lib/editor/canvas';
import { CODE_SETTINGS } from '$lib/editor/canvas/islands/codeSettingsOffer';
import { imageViews } from '$lib/editor/visual/extensions/image/canvas/imageView';
import { tableViews } from '$lib/editor/visual/extensions/table/canvas/tableViews';

export function markdownNodeViews(): CanvasViewProps {
	const core = {
		nodeViews: { ...coreNodeViews(), ...mathNodeViews('markdown'), ...islandNodeViews() },
		markViews: coreMarkViews(),
		blockSettings: { code_block: CODE_SETTINGS }
	};
	return canvasViewProps(composeNodeViews(core, tableViews('markdown'), imageViews('markdown')));
}
