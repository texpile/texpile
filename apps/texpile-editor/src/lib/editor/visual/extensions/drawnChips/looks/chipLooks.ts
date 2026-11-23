// the looks of a drawn chip's own classes: the maker names them, the element wears them
import { faceElement, setLook, type FaceElement, type StyleLook } from '$lib/editor/canvas';
import { HEAD_HOVER_LOOKS, HEAD_LOOKS } from './headLooks';
import { DEFINITION_LOOKS } from './definitionLooks';
import { GLOSSARY_LOOKS } from './glossaryLooks';
import { SETTING_LOOKS } from './settingLooks';
import { TITLE_LOOKS } from './titleLooks';
import { LINE_HOVER_LOOKS, LINE_LOOKS } from './lineLooks';
import { MARK_LOOKS } from './markLooks';
import { ROTATED_LOOKS } from './rotatedLooks';
import { SPACE_HOVER_LOOKS, SPACE_LOOKS } from './spaceLooks';

const RADIUS_HALF = 'calc(var(--radius-base) * 0.5)';

export const CHIP_ROOT_LOOK: StyleLook = { cursor: 'pointer', borderRadius: RADIUS_HALF };
export const CHIP_LINE_LOOK: StyleLook = { display: 'block' };
export const CHIP_SELECTED_LOOK: StyleLook = {
	outline: 'var(--default-border-width) solid var(--color-primary-500)',
	outlineOffset: '1px'
};

export type ClassLooks = {
	readonly looks: Readonly<Record<string, StyleLook>>;
	readonly hovers?: Readonly<Record<string, StyleLook>>;
};

const CHIP_CLASS_LOOKS: ClassLooks = {
	looks: {
		...LINE_LOOKS,
		...MARK_LOOKS,
		...ROTATED_LOOKS,
		...SETTING_LOOKS,
		...SPACE_LOOKS,
		...TITLE_LOOKS,
		...DEFINITION_LOOKS,
		...GLOSSARY_LOOKS,
		...HEAD_LOOKS
	},
	hovers: { ...LINE_HOVER_LOOKS, ...SPACE_HOVER_LOOKS, ...HEAD_HOVER_LOOKS }
};

export type ClassElement = (tag: string, className?: string, text?: string) => FaceElement;

/** a canvas element maker whose classes also take the looks of a language's own tables */
export function classElementWith(...tables: readonly ClassLooks[]): ClassElement {
	const all = [CHIP_CLASS_LOOKS, ...tables];
	return (tag, className = '', text) => {
		const el = faceElement(tag, className, text);
		for (const name of className.split(/\s+/)) {
			for (const { looks, hovers } of all) {
				if (looks[name]) setLook(el, looks[name]);
				if (hovers?.[name]) el.states = { ...el.states, hover: { ...el.states?.hover, ...hovers[name] } };
			}
		}
		return el;
	};
}

/** a canvas element for a chip part: the tag, the classes (kept for queries) and the looks of those classes, in order */
export const chipElement: ClassElement = classElementWith();
