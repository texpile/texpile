// the core's node views of the shared schema nodes every language draws: headings and lists
import type { CanvasNodeViews } from '../contracts/nodeViewTypes';
import { headingNodeView } from './headingView';
import { listNodeView } from './listView';

export function coreNodeViews(): CanvasNodeViews {
	return { heading: headingNodeView, list: listNodeView };
}
