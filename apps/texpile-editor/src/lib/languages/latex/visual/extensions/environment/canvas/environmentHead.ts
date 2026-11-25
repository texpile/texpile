// the head an environment draws before its body, element for element as EnvironmentHead.svelte drew it (8.4)
import type { FaceElement, VisualView } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import { m } from '$lib/paraglide/messages';
import { latexFace } from '../../../core/walk/drawUnits';
import type { EnvironmentLook } from '../environmentLook';
import { GEAR_ICON_LOOK, headButtonLook, headNameLook } from './environmentStyles';

/** a head's words: drawn when they hold LaTeX that draws, else as written */
function headText(text: string, view: VisualView): FaceElement | string {
	const face = text.includes('\\') ? latexFace(text, false) : null;
	if (!face) return text;
	const holder = view.canvas.build.el('span');
	holder.appendChild(face.dom);
	return holder;
}

function button(className: string, look: EnvironmentLook, view: VisualView): FaceElement {
	const el = view.canvas.build.el('button', className);
	el.setAttribute('data-look', look.kind);
	if (!view.editable) el.setAttribute('disabled', '');
	const dressed = headButtonLook(look);
	setLook(el, dressed.look);
	el.states = dressed.hover ? { hover: dressed.hover } : null;
	return el;
}

export function environmentHead(look: EnvironmentLook, number: string | null, view: VisualView): FaceElement {
	const { el, icon } = view.canvas.build;
	switch (look.kind) {
		case 'theorem': {
			const head = button('env-head', look, view);
			head.setAttribute('data-style', look.style);
			const name = head.appendChild(el('span', 'env-head-name', number ? `${look.head} ${number}` : look.head));
			setLook(name, headNameLook(look.style));
			if (look.note) head.append(' (', headText(look.note, view), ').');
			else head.append('.');
			return head;
		}
		case 'proof': {
			const head = button('env-head', look, view);
			head.append(headText(look.head, view), '.');
			return head;
		}
		case 'align': {
			const gear = button('env-gear', look, view);
			gear.setAttribute('data-align', look.align);
			gear.hint = m.env_settings_button_label();
			gear.setAttribute('aria-label', m.env_settings_button_label());
			const glyph = icon('settings', 24);
			glyph.classList.add('lucide-icon', 'size-3.5');
			setLook(glyph, GEAR_ICON_LOOK);
			gear.appendChild(glyph);
			return gear;
		}
		case 'box': {
			const label = button('env-label', look, view);
			label.textContent = look.label;
			return label;
		}
	}
}
