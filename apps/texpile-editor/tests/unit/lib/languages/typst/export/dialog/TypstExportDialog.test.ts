// @vitest-environment jsdom
//
// The export dialog shows the options of the format picked and nothing else, refuses to run what
// tinymist would refuse, and says where the files will go before asking.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TypstExportDialog from '$lib/languages/typst/export/dialog/TypstExportDialog.svelte';
import { typstExport } from '$lib/languages/typst/export/dialog/typstExportState.svelte';
import { DEFAULT_EXPORT_OPTIONS } from '$lib/languages/typst/export/exportOptions';
import { mainFile } from '$lib/workspace/workspaceStore';

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;

const radio = (label: string) =>
	[...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent?.trim() === label)!;
const exportButton = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Export…')!;
const text = () => host.textContent ?? '';

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

beforeEach(() => {
	mainFile.current = '/p/thesis.typ';
	typstExport.options = { ...DEFAULT_EXPORT_OPTIONS };
	typstExport.error = null;
	typstExport.open = true;
	host = document.createElement('div');
	document.body.appendChild(host);
	app = mount(TypstExportDialog, { target: host });
	flushSync();
});

afterEach(() => {
	if (app) unmount(app);
	app = null;
	host.remove();
	typstExport.open = false;
	mainFile.current = null;
});

describe('TypstExportDialog', () => {
	it('opens on PDF with its standards, PDF/UA and tags, naming the main file', () => {
		expect(radio('PDF').getAttribute('aria-checked')).toBe('true');
		expect(host.querySelector('select')).not.toBeNull();
		expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
		expect(host.querySelector('code')?.textContent).toBe('thesis.typ');
		expect(exportButton().disabled).toBe(false);
	});

	it('shows resolution and layout for PNG, and the background only for one merged image', () => {
		radio('PNG').click();
		flushSync();
		expect(host.querySelector('select')).toBeNull();
		expect(host.querySelector('input[type="number"]')).not.toBeNull();
		expect(text()).toContain('thesis-1.png');
		expect(text()).not.toContain('Background');
		radio('One image').click();
		flushSync();
		expect(text()).toContain('Background');
		expect(text()).not.toContain('thesis-1.png');
	});

	it('shows only the layout for SVG, and only a note for HTML', () => {
		radio('SVG').click();
		flushSync();
		expect(host.querySelector('input[type="number"]')).toBeNull();
		expect(text()).toContain('One file per page');
		radio('HTML').click();
		flushSync();
		expect(host.querySelector('#typst-export-pages')).toBeNull();
		expect(text()).toContain('experimental');
	});

	it('will not export a page range tinymist would refuse', () => {
		type(host.querySelector<HTMLInputElement>('#typst-export-pages')!, '5-2');
		expect(exportButton().disabled).toBe(true);
		type(host.querySelector<HTMLInputElement>('#typst-export-pages')!, '2-5');
		expect(exportButton().disabled).toBe(false);
	});

	it('will not export PDF/UA-1 as PDF/A-4, and keeps tags on where a standard needs them', () => {
		const select = host.querySelector('select')!;
		select.value = 'a-4';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		const [ua, tagged] = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
		ua.click();
		flushSync();
		expect(text()).toContain('cannot be combined');
		expect(exportButton().disabled).toBe(true);
		expect(tagged.checked).toBe(true);
		expect(tagged.disabled).toBe(true);
	});

	it('shows why the last export failed', () => {
		typstExport.error = 'PDF/UA-1 error: missing document title';
		flushSync();
		expect(host.querySelector('[role="alert"]')?.textContent).toBe('PDF/UA-1 error: missing document title');
	});
});
