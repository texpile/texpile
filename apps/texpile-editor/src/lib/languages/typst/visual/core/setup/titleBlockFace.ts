// a template given a title, authors, a date or an abstract, drawn as the title block LaTeX draws for \maketitle
import type { FaceElement } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { chipElement } from '$lib/editor/visual/extensions/drawnChips/looks/chipLooks';
import { settingRow } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
import { titleLine } from '$lib/editor/visual/extensions/drawnChips/titleBlock/titleLine';
import { m } from '$lib/paraglide/messages';
import type { TypstFileScope, TypstTitlePart } from '../../../knowledge';
import { fieldCell, fieldItems, fieldText, type FieldNode } from '../reading/fieldText';
import type { TemplateCall, TemplateField } from './templateCall';

type TitleLineDrawing = FaceElement | 'empty' | null;

const ORDER: TypstTitlePart[] = ['title', 'subtitle', 'author', 'date', 'abstract', 'keywords'];

function drawTextLine(part: string, label: string | null, text: string): FaceElement {
	const line = titleLine(part, label, chipElement);
	line.appendChild(chipElement('span', 'title-matter-text', text));
	return line;
}

function drawCodeLine(field: TemplateField, source: string): FaceElement {
	const line = titleLine(field.part!, null, chipElement, true);
	line.textContent = `${field.name}: ${source.slice(field.value.from, field.value.to).replace(/\s+/g, ' ')}`;
	return line;
}

function drawAuthorsLine(items: FieldNode[], scope: TypstFileScope | null): TitleLineDrawing {
	const cells = items.map((item) => fieldCell(item, scope));
	if (cells.some((cell) => cell === null)) return null;
	const named = cells.filter((cell) => cell!.name);
	if (!named.length) return 'empty';
	const line = titleLine('author', null, chipElement);
	for (const cell of named) {
		const box = line.appendChild(chipElement('div', 'title-matter-cell'));
		box.append(cell!.name);
		for (const text of cell!.lines) {
			box.appendChild(chipElement('div', 'title-matter-affiliation', text));
		}
	}
	return line;
}

function drawFieldLine(field: TemplateField, source: string, scope: TypstFileScope | null): TitleLineDrawing {
	const at: FieldNode = { node: field.value, source };
	const part = field.part!;
	if (part === 'author') return drawAuthorsLine(fieldItems(at, scope), scope);
	if (part === 'keywords') {
		const words = fieldItems(at, scope).map((item) => fieldText(item, scope));
		return words.some((word) => word === null) ? null : drawTextLine(part, m.title_keywords(), words.filter(Boolean).join(', '));
	}
	const texts = fieldItems(at, scope).map((item) => fieldText(item, scope));
	if (texts.some((text) => text === null)) return null;
	const text = texts.filter(Boolean).join(' ');
	return text ? drawTextLine(part, part === 'abstract' ? m.drawn_chip_typst_abstract() : null, text) : 'empty';
}

export function titleBlockFace(template: TemplateCall, source: string, scope: TypstFileScope | null, hint: string): ChipFace | null {
	const fields = template.fields.filter((field) => field.part).sort((a, b) => ORDER.indexOf(a.part!) - ORDER.indexOf(b.part!));
	if (!fields.length) return null;
	const dom = chipElement('div');
	dom.appendChild(settingRow({ target: m.drawn_chip_typst_template(), values: [template.name] }));
	for (const field of fields) {
		const line = drawFieldLine(field, source, scope);
		if (line !== 'empty') dom.append(line ?? drawCodeLine(field, source));
	}
	return tippedFace(dom, hint, { line: true });
}
