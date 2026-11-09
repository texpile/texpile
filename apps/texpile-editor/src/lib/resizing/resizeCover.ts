// a preview covered while its width keeps moving, the way the editor is (app.css, data-resize-cover)
import { ColumnWidth } from './columnWidth';

export function resizeCover(pane: HTMLElement): () => void {
	function settled(): void {
		width.breaking();
		width.broken();
	}
	const width = new ColumnWidth(pane, {
		breakNow: settled,
		hold() {
			if (width.moving) pane.toggleAttribute('data-resizing', true);
		},
		rest() {
			pane.toggleAttribute('data-resizing', false);
			settled();
		}
	});
	return () => width.destroy();
}
