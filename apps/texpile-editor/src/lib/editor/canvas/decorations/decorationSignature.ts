// the part of a block's decorations that changes its layout (9.5); with the width and the epoch, the layout key
import type { FrameDecorations } from '../contracts/decorationTypes';
import type { CanvasStyles } from '../contracts/styleTypes';
import { changesLayout, decorationLevel } from './decorationRuns';

/** widgets that take room, and the inline decorations whose span lays out differently; a tint or a caret moves nothing */
export function decorationSignature(
	decorations: FrameDecorations,
	from: number,
	to: number,
	styles: Pick<CanvasStyles, 'runStyle'>
): string {
	let signature = '';
	for (const widget of decorations.widgets)
		if (widget.pos > from && widget.pos < to && widget.spec.canvas?.kind !== 'caret')
			signature += `${widget.pos - from}:${widget.side}:${widget.key ?? widget.spec.canvas?.kind ?? ''};`;
	for (const decoration of decorations.inline)
		if (decoration.from < to && decoration.to > from && changesLayout(styles, decoration))
			signature += `${decoration.from - from}-${decoration.to - from}:${decorationLevel([decoration])!.key};`;
	return signature;
}
