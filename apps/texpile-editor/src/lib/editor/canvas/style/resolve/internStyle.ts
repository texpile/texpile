// computed values interned: equal values share one ComputedStyle, equal halves one layout or paint id
import type { ComputedStyle, LayoutStyle, PaintStyle } from '../../contracts/styleTypes';
import type { ComputedValues } from './resolveStyle';
import { boxOf, containerOf, paintOf, textOf, type ReadProperty } from './styleHalves';
import { LONGHAND_INDEX, LONGHANDS, PAINT_HALF, READ_ONLY_WHEN } from './styleProperties';

const CARET_COLOR = LONGHAND_INDEX.get('caretColor')!;
const GATES = READ_ONLY_WHEN.map(({ gate, applies, properties }) => ({
	gate: LONGHAND_INDEX.get(gate)!,
	applies,
	unread: properties.map((property) => LONGHAND_INDEX.get(property)!)
}));
const PAINT_INDEXES = LONGHANDS.flatMap((spec, i) => (PAINT_HALF.has(spec.name) ? [i] : []));
const LAYOUT_INDEXES = LONGHANDS.flatMap((spec, i) => (PAINT_HALF.has(spec.name) ? [] : [i]));

/** the values the halves read: '' where the box's kind leaves one unread, as the engines' parse expects */
function readValues(values: ComputedValues): string[] {
	const read = [...values];
	for (const { gate, applies, unread } of GATES) if (!applies(values[gate])) for (const i of unread) read[i] = '';
	// the engines answer caret-color auto with the text color
	if (read[CARET_COLOR] === 'auto') read[CARET_COLOR] = 'currentcolor';
	return read;
}

function readerOf(values: readonly string[]): ReadProperty {
	return (property) => {
		const index = LONGHAND_INDEX.get(property);
		return index === undefined ? '' : values[index];
	};
}

function keyOf(values: readonly string[], indexes: readonly number[]): string {
	let key = '';
	for (const i of indexes) key += `${values[i]}\u0001`;
	return key;
}

export class StyleValues {
	private readonly styles = new Map<string, ComputedStyle>();
	private readonly layouts = new Map<string, { id: number; layout: LayoutStyle }>();
	private readonly paints = new Map<string, { id: number; paint: PaintStyle }>();
	private readonly computed = new WeakMap<ComputedStyle, ComputedValues>();

	/** the one style for these values; the whole values key it, so what children inherit stays apart */
	intern(values: ComputedValues): ComputedStyle {
		const key = values.join('\u0001');
		let style = this.styles.get(key);
		if (style) return style;
		const read = readValues(values);
		const reader = readerOf(read);
		const layoutKey = keyOf(read, LAYOUT_INDEXES);
		let layout = this.layouts.get(layoutKey);
		if (!layout) {
			const parsed: LayoutStyle = { ...boxOf(reader), ...textOf(reader), ...containerOf(reader) };
			this.layouts.set(layoutKey, (layout = { id: this.layouts.size + 1, layout: parsed }));
		}
		const paintKey = keyOf(read, PAINT_INDEXES);
		let paint = this.paints.get(paintKey);
		if (!paint) this.paints.set(paintKey, (paint = { id: this.paints.size + 1, paint: paintOf(reader) }));
		style = { id: this.styles.size + 1, layoutId: layout.id, paintId: paint.id, layout: layout.layout, paint: paint.paint };
		this.styles.set(key, style);
		this.computed.set(style, values);
		return style;
	}

	valuesOf(style: ComputedStyle): ComputedValues {
		return this.computed.get(style)!;
	}
}

let initial: ComputedStyle | null = null;

/** every property at its initial value: what an element with no look and no parent computes to */
export function initialStyle(): ComputedStyle {
	return (initial ??= new StyleValues().intern(LONGHANDS.map((spec) => spec.initial)));
}
