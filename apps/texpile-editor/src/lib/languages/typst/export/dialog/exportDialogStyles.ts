// The export dialog's rows and segmented controls, in the compile-command modal's shapes so the two
// dialogs read as one family.
import type { PdfStandardChoice } from '../exportOptions.types';
import { m } from '$lib/paraglide/messages';

export const ROW = 'border-surface-200-800 border-b py-3 first:pt-0 last:border-b-0';
export const ROW_HEAD = 'flex items-center justify-between gap-4';
export const SEGMENT = 'bg-surface-200-800 rounded-base flex shrink-0 gap-1 p-0.5';

export function segmentClass(active: boolean): string {
	return `rounded-base px-2.5 py-1 text-xs ${active ? 'bg-surface-50-950 font-medium shadow-sm' : 'text-muted hover:text-surface-950-50'}`;
}

/** PDF 1.7, PDF/A-2b: the names the standards go by, which are not translated */
export function pdfStandardLabel(choice: PdfStandardChoice): string {
	if (!choice) return m.typst_export_pdf_standard_default();
	return choice.startsWith('a-') ? `PDF/A-${choice.slice(2)}` : `PDF ${choice}`;
}
