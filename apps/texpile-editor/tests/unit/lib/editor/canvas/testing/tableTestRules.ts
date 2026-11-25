import type { StyleLook } from '$lib/editor/canvas';
import type { FixedStyleRule } from './fixedStyles';

// the editor's sheet for a table as it prints: collapsed 1px borders, cells padded and at least 100px wide
export function tableRules(table: StyleLook = {}): FixedStyleRule[] {
	return [
		{ selector: 'table', look: { display: 'table', borderCollapse: 'collapse', margin: '0px auto', ...table } },
		{ selector: 'tbody', look: { display: 'table-row-group' } },
		{ selector: 'tr', look: { display: 'table-row' } },
		{
			selector: 'td',
			look: {
				display: 'table-cell',
				boxSizing: 'border-box',
				border: '1px solid',
				padding: '4px 8px',
				minWidth: '100px',
				verticalAlign: 'top'
			}
		},
		{ selector: 'td[data-mc-align]', look: { borderBottomWidth: '3px' } }
	];
}
