// a bibliography entry's key chip and the list's heading, drawn as BibKeyChip and BibliographyHeading drew them
import { setLook, type CanvasWidget, type StyleLook } from '$lib/editor/canvas';
import { bibliographyName, templateFeaturesStore, type KeyedEntry } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { headOf, openBibKeyPanel } from '../bibKeyPanel';

const HOST_LOOK: StyleLook = { marginRight: '0.5em' };
const CHIP_LOOK: StyleLook = {
	display: 'inline-flex',
	alignItems: 'baseline',
	gap: '0.25em',
	padding: '0 0.3em',
	borderRadius: 'calc(var(--radius-base) * 0.5)',
	backgroundColor: 'color-mix(in oklab, currentColor 8%, transparent)',
	textIndent: '0',
	cursor: 'pointer'
};
const ICON_LOOK: StyleLook = { flex: 'none', alignSelf: 'center', width: '0.75em', height: '0.75em', color: 'var(--muted-text)' };
const NAME_LOOK: StyleLook = { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85em' };
// document.css's h1, which the DOM heading took
const HEADING_LOOK: StyleLook = {
	margin: 'calc(var(--spacing) * 5) 0 calc(var(--spacing) * 2)',
	fontSize: 'calc(var(--text-base) * 1.4)',
	lineHeight: '1.375',
	fontWeight: '600',
	fontFamily: 'var(--typo-heading--font-family)'
};

/** the key before the entry's text; `pos` is the widget's, two inside the entry */
export function keyChipForm(entry: KeyedEntry): CanvasWidget {
	const key = headOf(entry.node).key;
	return {
		kind: 'inline',
		build(ctx) {
			const host = ctx.el('span', 'bib-key');
			setLook(host, HOST_LOOK);
			const chip = host.appendChild(ctx.el('span', 'text-chip'));
			setLook(chip, CHIP_LOOK);
			chip.states = { hover: { backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)' } };
			chip.hint = m.bib_key_chip_title({ key });
			setLook(chip.appendChild(ctx.icon('tag', 16)), ICON_LOOK);
			setLook(chip.appendChild(ctx.el('span', 'text-chip-name', key || m.bib_key_empty())), NAME_LOOK);
			chip.on.click = () => {
				const box = chip.getBoundingClientRect();
				openBibKeyPanel(ctx.view, () => ctx.pos() - 2, entry.command, box);
				return true;
			};
			return host;
		}
	};
}

export const headingForm: CanvasWidget = {
	kind: 'block',
	build(ctx) {
		const name = ctx.read(
			{ kind: 'store', name: 'drawnInputs' },
			() => templateFeaturesStore.current.bibliographyName ?? bibliographyName('')
		);
		const heading = ctx.el('h1', 'bibliography-heading', name);
		heading.setAttribute('data-unnumbered', 'true');
		setLook(heading, name ? HEADING_LOOK : { display: 'none' });
		return heading;
	}
};
