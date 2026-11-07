import { faceElement, sourceHint, type ChipFace } from '../chipFace';
import { tip } from '$lib/components/tooltip.svelte';
import './definitions.css';

export type DefinitionLine = { name: string; params: string; sign: string; body: HTMLElement };

export function definitionBody(drawn: ChipFace | null, code: string, kept: ChipFace[]): HTMLElement {
	const el = faceElement('span', 'drawn-definition-body');
	if (drawn && !drawn.line && !drawn.mixed) {
		kept.push(drawn);
		el.appendChild(drawn.dom);
		return el;
	}
	drawn?.destroy?.();
	el.classList.add('drawn-definition-code');
	el.textContent = code;
	return el;
}

export function definitionsFace(lines: DefinitionLine[], source: string, drawn: ChipFace[]): ChipFace {
	const dom = faceElement('span', 'drawn-definitions');
	for (const line of lines) {
		const name = dom.appendChild(faceElement('span', 'drawn-definition-name', line.name));
		if (line.params) name.appendChild(faceElement('span', 'drawn-definition-params', line.params));
		dom.appendChild(faceElement('span', 'drawn-definition-sign', line.sign));
		dom.appendChild(line.body);
	}
	const tipped = tip(dom, sourceHint(source));
	return {
		dom,
		line: true,
		destroy() {
			drawn.forEach((face) => face.destroy?.());
			tipped.destroy();
		}
	};
}
