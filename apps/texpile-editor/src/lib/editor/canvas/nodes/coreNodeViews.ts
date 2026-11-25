// the core's node and mark views of the shared schema every language draws: headings, lists and links
import type { CanvasMarkViews, CanvasNodeViews } from '../contracts/nodeViewTypes';
import { headingNodeView } from './headingView';
import { linkMarkView } from './linkMarkView';
import { listNodeView } from './listView';

export function coreNodeViews(): CanvasNodeViews {
	return { heading: headingNodeView, list: listNodeView };
}

export function coreMarkViews(): CanvasMarkViews {
	return { link: linkMarkView };
}
