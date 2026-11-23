// the table node views of every language (15.1); Markdown has bare tables only
import type { CanvasViewSet, EditorLanguage } from '$lib/editor/canvas';
import { tableCaptionView, tableNotesView } from './captionViews';
import { tableCellView } from './cellView';
import { tableGridView } from './gridView';
import { tableWrapperView } from './wrapperView';
import { tableWrapperSettings } from './wrapperSettings';
import './tableWrapper.css';

export function tableViews(language: EditorLanguage): CanvasViewSet {
	const cell = tableCellView(language !== 'markdown');
	const bare = { table: tableGridView, table_cell: cell, table_header: cell };
	if (language === 'markdown') return { nodeViews: bare };
	return {
		nodeViews: { ...bare, table_wrapper: tableWrapperView, table_caption: tableCaptionView, table_notes: tableNotesView },
		blockSettings: { table_wrapper: tableWrapperSettings(language) }
	};
}
