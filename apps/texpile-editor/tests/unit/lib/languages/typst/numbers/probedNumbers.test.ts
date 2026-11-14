import { describe, expect, it } from 'vitest';
import { probedNumbers, type NumbersProbeServer } from '$lib/languages/typst/numbers/probedNumbers';

function replyWith(items: unknown): { data: string } {
	const bytes = new TextEncoder().encode(JSON.stringify(items));
	return { data: btoa(String.fromCharCode(...bytes)) };
}

describe('probedNumbers', () => {
	it('reads the items and leaves out a footnote that repeats an earlier one', async () => {
		const server: NumbersProbeServer = {
			show: () => {},
			query: async () =>
				replyWith([
					{ kind: 'heading', number: '1.a', label: 'sec', text: 'Méthode', level: 2, page: 1, exact: true },
					{ kind: 'equation', number: null, label: null, text: '', page: 1, exact: true },
					{ kind: 'figure', number: '2', label: null, text: 'Plot', figureKind: 'table', supplement: 'Table', page: 2, exact: false },
					{ kind: 'footnote', number: '†', label: 'fn', text: 'note', repeats: null, page: 2, exact: true },
					{ kind: 'footnote', number: '†', label: null, text: 'note', repeats: 'fn', page: 3, exact: true }
				])
		};
		expect(await probedNumbers(server, 'probe')).toEqual([
			{ kind: 'heading', number: '1.a', label: 'sec', text: 'Méthode', level: 2, page: 1 },
			{ kind: 'equation', number: null, label: null, text: '', page: 1 },
			{ kind: 'figure', number: '2', label: null, text: 'Plot', figureKind: 'table', supplement: 'Table', page: 2 },
			{ kind: 'footnote', number: '†', label: 'fn', text: 'note', page: 2 }
		]);
	});

	it('sends a new version of the probe when the server built its project without it', async () => {
		const shown: string[] = [];
		let asked = 0;
		const server: NumbersProbeServer = {
			show: (text) => shown.push(text),
			query: async () => {
				asked++;
				if (asked < 3)
					throw {
						code: -32603,
						message: 'document is not available for export: "error: file not found (searched at /w/__texpile_numbers.typ)"'
					};
				return replyWith([]);
			}
		};
		expect(await probedNumbers(server, 'probe', 0)).toEqual([]);
		expect(shown).toEqual(['probe', 'probe\n', 'probe\n\n']);
	});

	it('gives null for a document that does not compile, asking once', async () => {
		let asked = 0;
		const server: NumbersProbeServer = {
			show: () => {},
			query: async () => {
				asked++;
				throw { code: -32603, message: 'document is not available for export: "error: unknown variable: nope"' };
			}
		};
		expect(await probedNumbers(server, 'probe', 0)).toBeNull();
		expect(asked).toBe(1);
	});
});
