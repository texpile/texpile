// an input method's underline under its preedit (11.3), in the text's own color
import type { CompositionPaint } from '../contracts/engineTypes';
import type { TextMeasure } from '../contracts/layoutTypes';
import type { RunStyle } from '../contracts/styleTypes';
import type { BlockOnModel } from '../geometry/lineIndex';
import { textX } from '../geometry/positionMap';
import { compositionUnderlines } from '../layout/inline/compositionRun';
import { canvasFill } from '../style/resolve/colorValue';
import { snapRect, type DevicePixels } from './devicePixels';

export function paintCompositionUnderlines(
	ctx: CanvasRenderingContext2D,
	block: BlockOnModel,
	composition: CompositionPaint,
	tools: { measure: TextMeasure; run: (run: RunStyle) => RunStyle },
	px: DevicePixels
): void {
	const base = block.frame.pos;
	const preedit = { from: composition.from - base, to: composition.to - base };
	const formats = composition.formats.map((format) => ({ ...format, from: format.from - base, to: format.to - base }));
	for (const textblock of block.placement.textblocks) {
		const start = textblock.offset + 1;
		if (preedit.to <= start || preedit.from >= start + textblock.node.content.size) continue;
		for (const line of textblock.lines) {
			const color = line.fragments.find((fragment) => fragment.kind === 'text' && fragment.to > preedit.from && fragment.from < preedit.to);
			if (color?.kind !== 'text') continue;
			const underlines = compositionUnderlines(
				line,
				preedit,
				formats,
				(fragment, length) => textX(fragment, fragment.from + length, block.node, tools.measure) - fragment.x
			);
			// eslint-disable-next-line no-param-reassign -- painting sets the canvas context's state
			ctx.fillStyle = canvasFill(tools.run(color.run).paint.color);
			for (const underline of underlines) {
				const rect = snapRect(
					{ x: textblock.x + underline.x, y: textblock.y + underline.y, width: underline.width, height: underline.thickness },
					px
				);
				ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
			}
		}
	}
}
