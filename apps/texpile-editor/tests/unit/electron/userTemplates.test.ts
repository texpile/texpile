// Save as template, on disk: what lands in the templates folder, what comes back out into a project,
// and that a failed or replacing save never leaves the list with half a template or none.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
	applyUserTemplate,
	deleteUserTemplate,
	listUserTemplates,
	saveUserTemplate,
	updateUserTemplate
} from '../../../../../electron/src/templates/userTemplates';
import { isTemplateId, templateSlug, uniqueTemplateId } from '../../../../../electron/src/templates/templateNaming';
import { isInsidePath } from '../../../../../electron/src/templates/templateCopy';
import { surveyProject } from '../../../../../electron/src/templates/templateSurvey';

let base: string;
let project: string;
let store: string;

function put(root: string, rel: string, content = rel): void {
	const path = join(root, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'texpile-templates-'));
	project = join(base, 'project');
	store = join(base, 'userData', 'templates');
	put(project, 'main.typ', '= Hello\n');
	put(project, 'chapters/one.typ', '== One\n');
	put(project, 'references.bib', '@book{a, title={A}}\n');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

function request(name: string, extra: Partial<Parameters<typeof saveUserTemplate>[1]> = {}) {
	return {
		root: project,
		files: ['main.typ', 'chapters/one.typ', 'references.bib'],
		name,
		description: 'A test template',
		lang: 'typst' as const,
		mainFile: 'main.typ',
		...extra
	};
}

describe('template folder names', () => {
	it('slugs a name into a portable folder name', () => {
		expect(templateSlug('My Thesis (2026)')).toBe('my-thesis-2026');
		expect(templateSlug('  Über résumé  ')).toBe('uber-resume');
		expect(templateSlug('论文')).toBe('template');
		expect(templateSlug('AUX')).toBe('template-aux');
		expect(templateSlug('x'.repeat(80))).toHaveLength(48);
	});

	it('numbers a clash, ignoring case', () => {
		expect(uniqueTemplateId('Paper', [])).toBe('paper');
		expect(uniqueTemplateId('Paper', ['Paper', 'paper-2'])).toBe('paper-3');
		expect(uniqueTemplateId('paper!', ['paper'])).toBe('paper-2');
	});

	it('accepts only plain folder names back from the renderer', () => {
		expect(isTemplateId('paper-2')).toBe(true);
		for (const bad of ['../x', '.staging', 'a/b', '', 'A', 7]) expect(isTemplateId(bad)).toBe(false);
		for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:\\x', '']) expect(isInsidePath(bad)).toBe(false);
		expect(isInsidePath('chapters/one.typ')).toBe(true);
	});
});

describe('saving and listing', () => {
	it('copies exactly the chosen files and lists the template', async () => {
		const saved = await saveUserTemplate(store, request('My Paper', { files: ['main.typ', 'chapters/one.typ'] }));
		expect(saved).toMatchObject({ id: 'my-paper', name: 'My Paper', lang: 'typst', mainFile: 'main.typ' });
		expect(readFileSync(join(store, 'my-paper', 'files', 'chapters', 'one.typ'), 'utf8')).toBe('== One\n');
		expect(existsSync(join(store, 'my-paper', 'files', 'references.bib'))).toBe(false);
		expect(await listUserTemplates(store)).toEqual([saved]);
	});

	it('gives a second template of the same name its own folder', async () => {
		await saveUserTemplate(store, request('Paper'));
		const second = await saveUserTemplate(store, request('Paper'));
		expect(second.id).toBe('paper-2');
		expect((await listUserTemplates(store)).map((t) => t.id)).toEqual(['paper', 'paper-2']);
	});

	it('replaces a template in place when asked', async () => {
		const first = await saveUserTemplate(store, request('Paper'));
		put(project, 'main.typ', '= Changed\n');
		const again = await saveUserTemplate(store, request('Paper', { replaceId: first.id, description: 'new' }));
		expect(again.id).toBe(first.id);
		expect(readFileSync(join(store, 'paper', 'files', 'main.typ'), 'utf8')).toBe('= Changed\n');
		expect(await listUserTemplates(store)).toEqual([again]);
		expect(readdirSync(store)).toEqual(['paper']);
	});

	it('leaves nothing behind when a file cannot be read', async () => {
		await expect(saveUserTemplate(store, request('Broken', { files: ['main.typ', 'missing.typ'] }))).rejects.toThrow();
		expect(await listUserTemplates(store)).toEqual([]);
		expect(readdirSync(store)).toEqual([]);
	});

	it('refuses files outside the folder and a main file that is not saved', async () => {
		await expect(saveUserTemplate(store, request('Evil', { files: ['main.typ', '../secret.txt'] }))).rejects.toThrow(/outside/);
		await expect(saveUserTemplate(store, request('NoMain', { mainFile: 'other.typ' }))).rejects.toThrow(/main file/);
		await expect(saveUserTemplate(store, request('   '))).rejects.toThrow(/name/);
	});

	it('skips a folder without a readable template.json', async () => {
		await saveUserTemplate(store, request('Good'));
		mkdirSync(join(store, 'stray'));
		put(store, 'broken/template.json', '{ not json');
		expect((await listUserTemplates(store)).map((t) => t.id)).toEqual(['good']);
	});
});

describe('editing, deleting and applying', () => {
	it('renames and redescribes without touching the files', async () => {
		const t = await saveUserTemplate(store, request('Paper'));
		const next = await updateUserTemplate(store, t.id, 'Lab report', '');
		expect(next).toMatchObject({ id: 'paper', name: 'Lab report', description: '' });
		expect((await listUserTemplates(store))[0].name).toBe('Lab report');
		expect(existsSync(join(store, 'paper', 'files', 'main.typ'))).toBe(true);
	});

	it('deletes only a plain template id', async () => {
		const t = await saveUserTemplate(store, request('Paper'));
		await expect(deleteUserTemplate(store, '../project')).rejects.toThrow();
		await deleteUserTemplate(store, t.id);
		expect(await listUserTemplates(store)).toEqual([]);
		expect(existsSync(project)).toBe(true);
	});

	it('copies a template into a folder, keeping files already there', async () => {
		const t = await saveUserTemplate(store, request('Paper'));
		const target = join(base, 'new');
		put(target, 'references.bib', 'mine');
		const main = await applyUserTemplate(store, t.id, target);
		expect(main).toBe(join(target, 'main.typ'));
		expect(readFileSync(join(target, 'chapters', 'one.typ'), 'utf8')).toBe('== One\n');
		expect(readFileSync(join(target, 'references.bib'), 'utf8')).toBe('mine');
	});

	it('saves a Git remote with no files, which the renderer clones rather than copies', async () => {
		const t = await saveUserTemplate(store, request('Thesis', { files: [], remote: 'https://me:token@example.org/lab/thesis.git' }));
		expect(existsSync(join(store, t.id, 'files'))).toBe(false);
		await updateUserTemplate(store, t.id, 'Lab thesis', '');
		expect((await listUserTemplates(store))[0]).toMatchObject({ name: 'Lab thesis', remote: 'https://example.org/lab/thesis.git' });
		await expect(applyUserTemplate(store, t.id, join(base, 'new'))).rejects.toThrow();
		await expect(saveUserTemplate(store, request('Bad', { files: [], remote: '--upload-pack=touch x' }))).rejects.toThrow();
	});
});

describe('surveying a project', () => {
	it('lists files with sizes, leaving out ignored folders', async () => {
		put(project, '.git/HEAD', 'ref');
		put(project, '.texpile/config.json', '{}');
		put(project, 'node_modules/x/index.js', 'x');
		put(project, 'output/main.pdf', 'pdf');
		put(project, '_draft/draft.pdf', 'pdf');
		put(project, 'figures/plot.png', '12345');
		const survey = await surveyProject(project, 100);
		expect(survey.truncated).toBe(false);
		expect(survey.files.map((f) => f.path).sort()).toEqual(['chapters/one.typ', 'figures/plot.png', 'main.typ', 'references.bib']);
		expect(survey.files.find((f) => f.path === 'figures/plot.png')?.size).toBe(5);
	});

	it('stops at the file limit and says so', async () => {
		const survey = await surveyProject(project, 2);
		expect(survey.files).toHaveLength(2);
		expect(survey.truncated).toBe(true);
	});
});
