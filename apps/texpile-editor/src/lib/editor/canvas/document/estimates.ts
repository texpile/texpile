// a never laid-out block's height (5.6): its face's estimate, else its text at the column width in its type's line,
// corrected by how far the measured blocks of its type were off
import type { Node as PMNode } from 'prosemirror-model';
import type { BlockLayout } from '../contracts/layoutTypes';
import type { ComputedStyle, Length, LengthOr } from '../contracts/styleTypes';
import type { BlockMeasure } from './blockHeights';

/** a type's line and margins, from its placeholder's computed style or a laid-out block of it */
type TypeLook = { readonly line: number; readonly char: number; readonly marginTop: number; readonly marginBottom: number };
type TypeCorrection = { ratio: number; samples: number };

const UNSTYLED: TypeLook = { line: 24, char: 8, marginTop: 0, marginBottom: 0 };
/** an average advance of prose in em; the per-type ratio takes up what it misses */
const ADVANCE_EM = 0.5;
const NORMAL_LINE_HEIGHT = 1.2;
/** the running ratio weighs about this many recent blocks */
const RATIO_WINDOW = 20;

function marginPx(margin: LengthOr<'auto'>, width: number): number {
	return margin === 'auto' ? 0 : lengthPx(margin, width);
}

function lengthPx(length: Length, width: number): number {
	return length.px + (length.percent / 100) * width;
}

function lookOf(style: ComputedStyle, width: number): TypeLook {
	const { font, lineHeight, margin } = style.layout;
	return {
		line: lineHeight === 'normal' ? font.sizePx * NORMAL_LINE_HEIGHT : lineHeight,
		char: font.sizePx * ADVANCE_EM,
		marginTop: marginPx(margin.top, width),
		marginBottom: marginPx(margin.bottom, width)
	};
}

export class BlockEstimates {
	private readonly looks = new Map<string, TypeLook>();
	private readonly corrections = new Map<string, TypeCorrection>();
	private epoch: number | null = null;

	/** nodeEstimate: a known image size, a cached formula size, a card's height (the nodeEstimates prop) */
	constructor(private readonly nodeEstimate: (node: PMNode, width: number) => number | null) {}

	/** looks are read again in a new style epoch; corrections stay */
	setEpoch(epoch: number): void {
		if (epoch === this.epoch) return;
		this.epoch = epoch;
		this.looks.clear();
	}

	/** placeholderStyle: the style of the block's own outer element, asked once per type and epoch */
	estimate(node: PMNode, width: number, placeholderStyle: () => ComputedStyle | null): BlockMeasure {
		const look = this.typeLook(node.type.name, width, placeholderStyle);
		const own = this.nodeEstimate(node, width);
		const ratio = this.corrections.get(node.type.name)?.ratio ?? 1;
		const height = own ?? this.textHeight(node, width, look) * ratio;
		return { height, marginTop: look.marginTop, marginBottom: look.marginBottom, estimated: true };
	}

	/** a laid-out block teaches its type its look and how far the text estimate was off */
	learn(node: PMNode, width: number, layout: BlockLayout): void {
		const look = lookOf(layout.box.style, width);
		this.looks.set(node.type.name, look);
		const text = this.textHeight(node, width, look);
		if (text <= 0 || layout.error || this.nodeEstimate(node, width) !== null) return;
		const correction = this.corrections.get(node.type.name) ?? { ratio: 1, samples: 0 };
		correction.samples = Math.min(RATIO_WINDOW, correction.samples + 1);
		correction.ratio += (layout.height / text - correction.ratio) / correction.samples;
		this.corrections.set(node.type.name, correction);
	}

	private typeLook(type: string, width: number, placeholderStyle: () => ComputedStyle | null): TypeLook {
		let look = this.looks.get(type);
		if (!look) {
			const style = placeholderStyle();
			look = style ? lookOf(style, width) : UNSTYLED;
			this.looks.set(type, look);
		}
		return look;
	}

	private textHeight(node: PMNode, width: number, look: TypeLook): number {
		const lines = Math.max(1, Math.ceil((node.textContent.length * look.char) / Math.max(1, width)));
		return lines * look.line;
	}
}
