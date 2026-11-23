import type { StyleLook } from '$lib/editor/canvas';
import type { EnvironmentLook } from '../environmentLook';

const HOVER_WASH = 'color-mix(in srgb, var(--color-surface-500) 12%, transparent)';
const RADIUS = 'calc(var(--radius-base) * 0.5)';

export const ENVIRONMENT_LOOK: StyleLook = { position: 'relative', margin: 'calc(var(--spacing) * 3) 0' };
export const BOX_ENVIRONMENT_LOOK: StyleLook = {
	padding: 'calc(var(--spacing) * 2) calc(var(--spacing) * 3)',
	borderRadius: 'var(--radius-base)',
	border: 'var(--default-border-width) solid var(--color-surface-200-800)'
};
export const BODY_AFTER_LOOK: StyleLook = { display: 'block', clear: 'both' };
export const GEAR_PLACE_LOOK: StyleLook = { position: 'absolute', pointerEvents: 'none' };

const HEADER_LOOKS: Record<EnvironmentLook['kind'], StyleLook> = {
	theorem: { float: 'left', marginRight: '0.35em' },
	proof: { float: 'left', marginRight: '0.35em' },
	align: { position: 'absolute', right: '0px', top: '0px', zIndex: '1', marginRight: '0.35em', opacity: '0' },
	box: { float: 'none', marginBottom: 'calc(var(--spacing) * 1)' }
};

/** directly in the editor the block handle's gear opens the alignment, so the head stays out of the way */
export function headerLook(kind: EnvironmentLook['kind'], topLevel: boolean): StyleLook {
	return kind === 'align' && topLevel ? { ...HEADER_LOOKS.align, display: 'none' } : HEADER_LOOKS[kind];
}

/** the head's button; a gear and a label tint on hover as the app's buttons do */
export function headButtonLook(look: EnvironmentLook): { look: StyleLook; hover: StyleLook | null } {
	const button: StyleLook = { display: 'inline-block', textAlign: 'center', font: 'inherit', cursor: 'pointer', borderRadius: RADIUS };
	switch (look.kind) {
		case 'theorem':
		case 'proof':
			return { look: look.kind === 'proof' ? { ...button, fontStyle: 'italic' } : button, hover: { backgroundColor: HOVER_WASH } };
		case 'align':
			return {
				look: {
					display: 'flex',
					textAlign: 'center',
					padding: 'calc(var(--spacing) * 0.5)',
					borderRadius: 'var(--radius-base)',
					color: 'var(--faint-text)',
					cursor: 'pointer'
				},
				hover: { color: 'var(--muted-text)', backgroundColor: 'color-mix(in srgb, var(--color-surface-500) 15%, transparent)' }
			};
		case 'box':
			return {
				look: {
					...button,
					fontSize: '0.7rem',
					letterSpacing: '0.06em',
					textTransform: 'uppercase',
					color: 'var(--faint-text)'
				},
				hover: { color: 'var(--muted-text)' }
			};
	}
}

export function headNameLook(style: string): StyleLook {
	return style === 'remark' ? { fontWeight: '400', fontStyle: 'italic' } : { fontWeight: '700' };
}

/** the body's text: a plain-style theorem sets it in italics, center and right set the text of an aligned environment; a float caption among the children stacks them */
export function bodyLook(look: EnvironmentLook): StyleLook {
	if (look.kind === 'theorem' && look.style === 'plain') return { fontStyle: 'italic' };
	if (look.kind === 'align' && look.align !== 'left') return { textAlign: look.align };
	return {};
}

export const CAPTIONED_BODY_LOOK: StyleLook = { display: 'flex', flexDirection: 'column' };

export const GEAR_ICON_LOOK: StyleLook = { width: 'calc(var(--spacing) * 3.5)', height: 'calc(var(--spacing) * 3.5)' };
