// chips drawn on a line of their own (\vspace, a comment line, a divider): the line holds no caret but the chip selected
import type { LineGeometry } from '../contracts/geometryTypes';
import type { VisualView } from '../contracts/viewTypes';
import { caretPolicyAt } from '../geometry/caretPolicy';

/** the chip on a line of its own that `line` holds, which a move to the line selects */
export function ownLineChipOn(view: VisualView, line: LineGeometry): number | undefined {
	let found: number | undefined;
	view.state.doc.nodesBetween(line.from, line.to, (node, pos) => {
		if (found === undefined && node.isInline && !node.isText && pos >= line.from && caretPolicyAt(view, pos) === 'ownLine') found = pos;
		return found === undefined;
	});
	return found;
}
