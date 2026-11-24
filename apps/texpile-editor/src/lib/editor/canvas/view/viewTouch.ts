// the touch gestures and the selection handles they draw, one pair per view
import type { VisualView } from '../contracts/viewTypes';
import { SelectionHandles } from '../interaction/touch/selectionHandles';
import { TouchGestures } from '../interaction/touch/touchGestures';

export class ViewTouch {
	private readonly handles: SelectionHandles;
	private readonly gestures: TouchGestures;

	constructor(view: VisualView) {
		this.handles = new SelectionHandles(view);
		this.gestures = new TouchGestures({ view, showHandles: (on) => this.handles.show(on) });
	}

	/** after every frame: the handles follow the selection */
	place(): void {
		this.handles.place();
	}

	destroy(): void {
		this.gestures.destroy();
		this.handles.destroy();
	}
}
