import type { ArgumentHint } from './argumentSlots';

/** the command and its arguments as code, the cursor's argument in bold */
export function renderArgumentHint(hint: ArgumentHint): HTMLElement {
	const dom = document.createElement('div');
	dom.className = 'cm-tooltip-latex-hover cm-argument-hint';
	const code = dom.appendChild(document.createElement('code'));
	code.append(`\\${hint.command}`);
	hint.slots.forEach((slot, index) => {
		const part = code.appendChild(document.createElement('span'));
		part.textContent = `${slot.open}${slot.label}${slot.close}`;
		if (index === hint.active) part.className = 'cm-argument-hint-active';
	});
	return dom;
}
