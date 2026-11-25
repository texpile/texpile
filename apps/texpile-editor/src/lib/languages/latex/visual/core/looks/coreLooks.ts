import { setLook, type FaceElement } from '$lib/editor/canvas';
import { classElementWith, type ClassLooks } from '$lib/editor/visual/extensions/drawnChips/looks/chipLooks';

const HALF_RADIUS = 'calc(var(--radius-base) * 0.5)';

export const CORE_LOOKS: ClassLooks = {
	looks: {
		'drawn-leaders': { marginLeft: '0.25em', marginRight: '0.25em', letterSpacing: '0.1em', whiteSpace: 'nowrap' },
		'drawn-switch': {
			marginLeft: '0.15em',
			marginRight: '0.15em',
			fontFamily: 'var(--font-mono)',
			fontSize: '0.7rem',
			color: 'var(--faint-text)',
			borderRadius: HALF_RADIUS
		},
		'drawn-macro': { borderBottom: 'var(--default-border-width) dotted var(--faint-text)' },
		'drawn-macro-code': { fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
		'drawn-environment': { margin: 'calc(var(--spacing) * 1.5) 0' },
		'drawn-environment-name': {
			marginRight: '0.5em',
			fontSize: '0.7rem',
			letterSpacing: '0.04em',
			textTransform: 'uppercase',
			color: 'var(--muted-text)'
		}
	},
	hovers: {
		'drawn-switch': {
			color: 'var(--muted-text)',
			backgroundColor: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)'
		}
	}
};

export const coreElement = classElementWith(CORE_LOOKS);

/** the tinted text a \ref is drawn as, red while it points at nothing */
export function setRefLook(el: FaceElement, broken: boolean): void {
	el.classList.toggle('drawn-crossref-broken', broken);
	setLook(el, { borderRadius: 'var(--radius-base)', color: broken ? 'var(--color-ref-broken-fg)' : 'var(--color-ref-fg)' });
	Object.assign(el, { states: { hover: { backgroundColor: broken ? 'var(--color-ref-broken-bg)' : 'var(--color-ref-bg)' } } });
}
