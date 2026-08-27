// what the @-reference picker can offer: the bibliography plus every labeled table, figure
// and equation in the open document, and the text search across them
import type { EditorView } from 'prosemirror-view';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';
import { sectionNumbers } from '$lib/languages/latex/visual/extensions/label/sectionNumbers';

// table/figure/equation shapes share these; the filter reads the per-kind text field (caption/alt/content)
export type ReferenceItemMeta = {
	label: string;
	number: number;
	position: number;
	section?: string;
	caption?: string;
	alt?: string;
	content?: string;
	lineIndex?: number;
};

export type ReferenceItem = {
	type: 'bibliography' | 'equation' | 'figure' | 'table' | 'section';
	id: string;
	displayText: string;
	subtitle?: string;
	payload: BiblatexReference | ReferenceItemMeta;
};

/** Every standalone \label that anchors a heading, so a section can be referenced from the menu
 *  the way a figure already could. Labels with no number - inside a list - are not offered: the
 *  chip could not say what they point at. */
export function extractSectionReferences(view: EditorView): ReferenceItem[] {
	const numbers = sectionNumbers(view.state.doc);
	if (numbers.size === 0) return [];

	const sections: ReferenceItem[] = [];
	let heading = '';
	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			heading = node.textContent;
			return false;
		}
		if (node.type.name !== 'label') return;
		const label = String(node.attrs.name ?? '');
		const number = numbers.get(label);
		if (!number) return;
		sections.push({
			type: 'section',
			id: label,
			displayText: `${number} ${heading}`.trim(),
			subtitle: label,
			payload: { label, number: 0, position: pos, section: heading }
		});
	});
	return sections;
}

export function convertBibliographyToReferenceItems(citations: BiblatexReference[]): ReferenceItem[] {
	return citations.map((citation) => ({
		type: 'bibliography',
		id: citation.key,
		displayText: `${citation.author || 'Unknown'} (${citation.year || citation.date?.slice(0, 4) || 'n.d.'})`,
		subtitle: citation.title,
		payload: citation
	}));
}

export function extractTableReferences(view: EditorView): ReferenceItem[] {
	const tables: ReferenceItem[] = [];
	let tableCount = 0;

	let currentSection = '';

	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			currentSection = node.textContent || '';
		}

		if (node.type.name === 'table_wrapper' && node.attrs.label) {
			tableCount++;

			let captionText = '';
			if (node.firstChild && node.firstChild.type.name === 'table_caption') {
				captionText = node.firstChild.textContent || '';
			}

			const subtitle =
				currentSection && captionText ? `${currentSection} • ${captionText}` : currentSection || captionText || node.attrs.label;

			tables.push({
				type: 'table',
				id: node.attrs.label,
				displayText: `Table ${tableCount}`,
				subtitle: subtitle,
				payload: {
					label: node.attrs.label,
					number: tableCount,
					position: pos,
					section: currentSection,
					caption: captionText
				}
			});
		}
	});

	return tables;
}

export function extractFigureReferences(view: EditorView): ReferenceItem[] {
	const figures: ReferenceItem[] = [];
	let figureCount = 0;

	let currentSection = '';

	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			currentSection = node.textContent || '';
		}

		if (node.type.name === 'image' && node.attrs.label && node.attrs.numbered !== false) {
			figureCount++;

			// the image node's text children are the caption
			let captionText = '';
			node.descendants((child) => {
				if (child.isText) {
					captionText += child.text;
				}
			});
			captionText = captionText.trim();

			const subtitle =
				currentSection && captionText ? `${currentSection} • ${captionText}` : currentSection || captionText || node.attrs.label;

			figures.push({
				type: 'figure',
				id: node.attrs.label,
				displayText: `Figure ${figureCount}`,
				subtitle: subtitle,
				payload: {
					label: node.attrs.label,
					number: figureCount,
					position: pos,
					section: currentSection,
					caption: captionText,
					alt: node.attrs.alt || ''
				}
			});
		}
	});

	return figures;
}

export function extractEquationReferences(view: EditorView): ReferenceItem[] {
	const equations: ReferenceItem[] = [];
	// typst: an equation is referenceable iff it carries a <label> (the numbered attr is LaTeX
	// machinery; typst numbering is a document-level #set rule the editor doesn't track)
	const typst = !!view.state.schema.nodes.typ_ref;
	let equationCount = 0;

	let currentSection = '';

	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			currentSection = node.textContent || '';
		}

		if (typst) {
			if (node.type.name === 'block_math' && node.attrs.label) {
				equationCount++;
				const content = (node.attrs.typst as string) || node.textContent || '';
				const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
				equations.push({
					type: 'equation',
					id: node.attrs.label,
					// the label, not "Equation N": the editor shows no equation numbers in typst
					// (numbering is the template's #set rule), and the label is what the block
					// itself displays, so the menu offers exactly what the user sees
					displayText: `<${node.attrs.label}>`,
					subtitle: [currentSection, preview].filter(Boolean).join(' • ') || node.attrs.label,
					payload: { label: node.attrs.label, number: equationCount, position: pos, section: currentSection, content }
				});
			}
			return;
		}

		if (node.type.name === 'block_math' && node.attrs.numbered) {
			const equationContent = node.textContent || '';
			const lineLabels = (node.attrs.lineLabels as string[]) || [];
			const hasMultiLineLabels = lineLabels.some((l) => l && l.trim());

			if (hasMultiLineLabels) {
				lineLabels.forEach((label, index) => {
					if (label && label.trim()) {
						equationCount++;

						const lines = equationContent.split(/\\\\/);
						const lineContent = lines[index]?.trim() || '';
						const preview = lineContent.length > 40 ? lineContent.substring(0, 40) + '...' : lineContent;

						const subtitle = currentSection && preview ? `${currentSection} • ${preview}` : currentSection || preview || label;

						equations.push({
							type: 'equation',
							id: label,
							displayText: `Equation ${equationCount}`,
							subtitle: subtitle,
							payload: {
								label: label,
								number: equationCount,
								position: pos,
								section: currentSection,
								content: lineContent,
								lineIndex: index
							}
						});
					}
				});
			} else if (node.attrs.label) {
				equationCount++;

				const preview = equationContent.length > 50 ? equationContent.substring(0, 50) + '...' : equationContent;

				const subtitle = currentSection && preview ? `${currentSection} • ${preview}` : currentSection || preview || node.attrs.label;

				equations.push({
					type: 'equation',
					id: node.attrs.label,
					displayText: `Equation ${equationCount}`,
					subtitle: subtitle,
					payload: {
						label: node.attrs.label,
						number: equationCount,
						position: pos,
						section: currentSection,
						content: equationContent
					}
				});
			}
		}
	});

	return equations;
}

export function filterReferences(items: ReferenceItem[], query: string): ReferenceItem[] {
	if (!query) return items;

	const searchTerm = query.toLowerCase();
	return items.filter((item) => {
		if (item.type === 'bibliography') {
			const citation = item.payload as BiblatexReference;
			const authorStr = Array.isArray(citation.author) ? citation.author.join(' ') : citation.author || '';

			// auto-generated texpile-cite- keys aren't searchable, user custom keys are
			const searchableKey = citation.key?.startsWith('texpile-cite-') ? '' : citation.key?.toLowerCase() || '';

			return (
				searchableKey.includes(searchTerm) ||
				authorStr.toLowerCase().includes(searchTerm) ||
				citation.title?.toLowerCase().includes(searchTerm) ||
				citation.year?.toString().includes(searchTerm)
			);
		} else if (item.type === 'table') {
			const meta = item.payload as ReferenceItemMeta;
			const section = meta.section || '';
			const caption = meta.caption || '';

			return (
				item.displayText.toLowerCase().includes(searchTerm) ||
				section.toLowerCase().includes(searchTerm) ||
				caption.toLowerCase().includes(searchTerm) ||
				item.id.toLowerCase().includes(searchTerm)
			);
		} else if (item.type === 'figure') {
			const meta = item.payload as ReferenceItemMeta;
			const section = meta.section || '';
			const caption = meta.caption || '';
			const alt = meta.alt || '';

			return (
				item.displayText.toLowerCase().includes(searchTerm) ||
				section.toLowerCase().includes(searchTerm) ||
				caption.toLowerCase().includes(searchTerm) ||
				alt.toLowerCase().includes(searchTerm) ||
				item.id.toLowerCase().includes(searchTerm)
			);
		} else if (item.type === 'equation') {
			const meta = item.payload as ReferenceItemMeta;
			const section = meta.section || '';
			const content = meta.content || '';

			return (
				item.displayText.toLowerCase().includes(searchTerm) ||
				section.toLowerCase().includes(searchTerm) ||
				content.toLowerCase().includes(searchTerm) ||
				item.id.toLowerCase().includes(searchTerm)
			);
		} else if (item.type === 'section') {
			// the heading's own words are already in displayText, next to its number
			return item.displayText.toLowerCase().includes(searchTerm) || item.id.toLowerCase().includes(searchTerm);
		}
		return false;
	});
}
