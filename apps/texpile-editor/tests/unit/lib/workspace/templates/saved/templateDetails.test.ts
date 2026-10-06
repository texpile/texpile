// @vitest-environment jsdom
// Save as template, from the menu to the bridge: what the dialog offers to copy, the questions it
// asks before replacing a template or copying a large folder, and what it hands the main process.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TexpileTemplatesBridge, UserTemplate } from '$lib/workspace/templates/templateBridge.types';

const confirmAsk = vi.fn(async () => true);
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk }));
const toasts = { success: vi.fn(), error: vi.fn() };
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: toasts }));

const { templateDetails, openSaveAsTemplate } = await import('$lib/workspace/templates/saved/templateDetails.svelte');
const { userTemplates } = await import('$lib/workspace/templates/saved/userTemplateList');

const PAPER: UserTemplate = { id: 'paper', name: 'Paper', description: '', lang: 'typst', mainFile: 'main.typ', createdAt: 1 };

let bridge: { [K in keyof TexpileTemplatesBridge]: ReturnType<typeof vi.fn> };
let listed: UserTemplate[] = [];

function surveyOf(paths: Record<string, number>, truncated = false) {
	return { files: Object.entries(paths).map(([path, size]) => ({ path, size })), truncated, limit: 2000 };
}

beforeEach(() => {
	listed = [];
	bridge = {
		list: vi.fn(async () => listed),
		survey: vi.fn(async () => surveyOf({ 'main.typ': 100, 'main.pdf': 5000, 'refs.bib': 50, '.DS_Store': 6 })),
		save: vi.fn(async (req) => ({ ...PAPER, name: req.name })),
		update: vi.fn(),
		remove: vi.fn(),
		apply: vi.fn(),
		stage: vi.fn(),
		adopt: vi.fn(),
		discard: vi.fn(),
		universeIndex: vi.fn(),
		universeThumbnail: vi.fn(),
		universeUnpack: vi.fn()
	};
	vi.stubGlobal('texpileTemplates', bridge);
	confirmAsk.mockClear().mockResolvedValue(true);
	toasts.success.mockClear();
	toasts.error.mockClear();
});

afterEach(() => {
	templateDetails.hide();
	userTemplates.current = [];
	vi.unstubAllGlobals();
});

describe('Save as template', () => {
	it('writes pending edits first, names the template after the folder, and lists what it will copy', async () => {
		const order: string[] = [];
		bridge.survey.mockImplementation(async () => {
			order.push('survey');
			return surveyOf({ 'main.typ': 100, 'main.pdf': 5000, 'refs.bib': 50, '.DS_Store': 6 });
		});
		await openSaveAsTemplate('/home/me/Thesis', '/home/me/Thesis/main.typ', '/home/me/Thesis/main.pdf', async () => {
			order.push('flush');
		});
		expect(order).toEqual(['flush', 'survey']);
		expect(templateDetails.open).toBe(true);
		expect(templateDetails.name).toBe('Thesis');
		expect(templateDetails.selection).toEqual({ files: ['main.typ', 'refs.bib'], bytes: 150 });
		expect(templateDetails.canSubmit).toBe(true);
	});

	it('hands the main process the chosen files, the main file and the format', async () => {
		await openSaveAsTemplate('/p', '/p/main.typ', null, async () => {});
		templateDetails.name = '  Lab notes ';
		templateDetails.description = 'Weekly';
		await templateDetails.submit();
		expect(bridge.save).toHaveBeenCalledWith({
			root: '/p',
			files: ['main.typ', 'main.pdf', 'refs.bib'],
			name: 'Lab notes',
			description: 'Weekly',
			lang: 'typst',
			mainFile: 'main.typ',
			replaceId: undefined
		});
		expect(confirmAsk).not.toHaveBeenCalled();
		expect(templateDetails.open).toBe(false);
		expect(toasts.success).toHaveBeenCalled();
	});

	it('asks before replacing a template of the same name, and replaces it in place', async () => {
		listed = [PAPER];
		await openSaveAsTemplate('/p', '/p/main.typ', null, async () => {});
		templateDetails.name = 'paper';
		confirmAsk.mockResolvedValueOnce(false);
		await templateDetails.submit();
		expect(bridge.save).not.toHaveBeenCalled();
		expect(templateDetails.open).toBe(true);
		await templateDetails.submit();
		expect(bridge.save).toHaveBeenCalledWith(expect.objectContaining({ replaceId: 'paper' }));
	});

	it('asks before copying a large folder', async () => {
		bridge.survey.mockResolvedValue(surveyOf({ 'main.tex': 100, 'data/big.csv': 30 * 1024 * 1024 }));
		await openSaveAsTemplate('/p', '/p/main.tex', null, async () => {});
		confirmAsk.mockResolvedValueOnce(false);
		await templateDetails.submit();
		expect(confirmAsk).toHaveBeenCalledWith(expect.stringContaining('30.0 MB'), expect.anything());
		expect(bridge.save).not.toHaveBeenCalled();
	});

	it('refuses a folder with too many files, and one with no main document', async () => {
		bridge.survey.mockResolvedValue(surveyOf({ 'main.tex': 1 }, true));
		await openSaveAsTemplate('/p', '/p/main.tex', null, async () => {});
		expect(templateDetails.tooMany).toBe(2000);
		expect(templateDetails.canSubmit).toBe(false);
		templateDetails.hide();
		await openSaveAsTemplate('/p', '/p/figure.png', null, async () => {});
		expect(templateDetails.open).toBe(false);
		expect(toasts.error).toHaveBeenCalled();
	});

	it('keeps a folder it could not read apart from the name problems that typing clears', async () => {
		bridge.survey.mockRejectedValue(new Error('EACCES: permission denied'));
		await openSaveAsTemplate('/p', '/p/main.typ', null, async () => {});
		expect(templateDetails.surveyFailed).toContain('EACCES');
		expect(templateDetails.problem).toBe('');
	});

	it('reports a failed save and keeps the dialog open', async () => {
		bridge.save.mockRejectedValue(new Error('ENOSPC: no space left on device'));
		await openSaveAsTemplate('/p', '/p/main.typ', null, async () => {});
		await templateDetails.submit();
		expect(toasts.error).toHaveBeenCalledWith(expect.objectContaining({ description: 'ENOSPC: no space left on device' }));
		expect(templateDetails.open).toBe(true);
		expect(templateDetails.busy).toBe(false);
	});
});

describe('Rename', () => {
	it('refuses a name another template has, and renames otherwise', async () => {
		listed = [PAPER, { ...PAPER, id: 'lab', name: 'Lab' }];
		userTemplates.current = listed;
		templateDetails.showEdit(PAPER);
		templateDetails.name = 'lab';
		await templateDetails.submit();
		expect(templateDetails.problem).toContain('lab');
		expect(bridge.update).not.toHaveBeenCalled();
		templateDetails.name = 'Conference paper';
		await templateDetails.submit();
		expect(bridge.update).toHaveBeenCalledWith('paper', 'Conference paper', '');
		expect(templateDetails.open).toBe(false);
	});
});
