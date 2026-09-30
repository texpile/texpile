// The Typst Universe gallery's main-process half, against a recorded slice of the real index
// (packages.typst.org is not reachable from the test machine): which entries count as templates,
// which version is offered, and how a failed request is reported.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	clearTemplateIndexCache,
	fetchTemplateIndex,
	fetchThumbnail,
	templatesFromIndex,
	thumbnailUrl
} from '../../../../../electron/src/templates/typstUniverse';
import { adoptStagedDir, createStagedDir, discardStagedDir } from '../../../../../electron/src/templates/templateStaging';

// the shape packages.typst.org/preview/index.json has: every version of every package, templates
// marked by a `template` section
const INDEX = [
	{
		name: 'charged-ieee',
		version: '0.1.0',
		entrypoint: 'lib.typ',
		authors: ['Typst GmbH <https://typst.app>'],
		license: 'MIT-0',
		description: 'An IEEE-style paper template',
		keywords: ['paper', 'ieee'],
		categories: ['paper'],
		template: { path: 'template', entrypoint: 'main.typ', thumbnail: 'thumbnail.png' }
	},
	{
		name: 'charged-ieee',
		version: '0.1.10',
		entrypoint: 'lib.typ',
		authors: ['Typst GmbH <https://typst.app>'],
		description: 'An IEEE-style paper template to publish at conferences',
		keywords: ['paper', 'ieee'],
		categories: ['paper'],
		template: { path: 'template', entrypoint: 'main.typ', thumbnail: 'thumbnail.png' }
	},
	{
		name: 'charged-ieee',
		version: '0.1.9',
		entrypoint: 'lib.typ',
		description: 'older',
		template: { path: 'template', entrypoint: 'main.typ' }
	},
	{ name: 'cetz', version: '0.3.4', entrypoint: 'src/lib.typ', description: 'Drawing with Typst', categories: ['visualization'] },
	{
		name: 'modern-cv',
		version: '0.8.0',
		entrypoint: 'lib.typ',
		authors: ['DeveloperPaul123 <@DeveloperPaul123>', 'Someone Else'],
		description: 'A modern resume template',
		categories: ['cv'],
		template: { path: 'template', entrypoint: 'resume.typ' }
	},
	{ name: 'Bad Name', version: '1.0.0', template: { path: 't', entrypoint: 'main.typ' } },
	{ name: 'bad-version', version: 'latest', template: { path: 't', entrypoint: 'main.typ' } },
	{ name: 'no-entry', version: '1.0.0', template: { path: 't' } },
	'garbage',
	null
];

describe('templatesFromIndex', () => {
	it('keeps templates only, one per package at its newest version', () => {
		const list = templatesFromIndex(INDEX);
		expect(list.map((t) => `${t.name}:${t.version}`)).toEqual(['charged-ieee:0.1.10', 'modern-cv:0.8.0']);
	});

	it('carries what the gallery shows, with author contacts dropped', () => {
		const [ieee, cv] = templatesFromIndex(INDEX);
		expect(ieee).toEqual({
			name: 'charged-ieee',
			version: '0.1.10',
			description: 'An IEEE-style paper template to publish at conferences',
			authors: ['Typst GmbH'],
			keywords: ['paper', 'ieee'],
			categories: ['paper'],
			thumbnail: true
		});
		expect(cv.authors).toEqual(['DeveloperPaul123', 'Someone Else']);
		expect(cv.thumbnail).toBe(false);
	});

	it('offers the newest version the Typst in use can compile', () => {
		const index = [
			{ name: 'thesis', version: '1.0.0', compiler: '0.13.0', template: { path: 't', entrypoint: 'main.typ' } },
			{ name: 'thesis', version: '2.0.0', compiler: '0.16.0', template: { path: 't', entrypoint: 'main.typ' } },
			{ name: 'future', version: '1.0.0', compiler: '0.16.0', template: { path: 't', entrypoint: 'main.typ' } }
		];
		expect(templatesFromIndex(index, '0.15.1').map((t) => `${t.name}:${t.version}`)).toEqual(['thesis:1.0.0']);
		expect(templatesFromIndex(index, '0.16.0').map((t) => `${t.name}:${t.version}`)).toEqual(['future:1.0.0', 'thesis:2.0.0']);
		expect(templatesFromIndex(index).map((t) => `${t.name}:${t.version}`)).toEqual(['future:1.0.0', 'thesis:2.0.0']);
	});

	it('survives an index that is not a list', () => {
		expect(templatesFromIndex({ packages: [] })).toEqual([]);
		expect(templatesFromIndex(null)).toEqual([]);
	});

	it('builds thumbnail urls only from a checked name and version', () => {
		expect(thumbnailUrl('charged-ieee', '0.1.10')).toBe('https://packages.typst.org/preview/thumbnails/charged-ieee-0.1.10-small.webp');
		expect(thumbnailUrl('../x', '1.0.0')).toBeNull();
		expect(thumbnailUrl('x', '1.0.0/../../y')).toBeNull();
	});
});

describe('fetchTemplateIndex', () => {
	beforeEach(() => clearTemplateIndexCache());

	it('fetches the index once and serves the list from memory after that', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 }));
		const first = await fetchTemplateIndex(fetch, 'Texpile/test');
		expect(first.ok && first.templates.length).toBe(2);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://packages.typst.org/preview/index.json');
		expect(init.headers).toMatchObject({ 'User-Agent': 'Texpile/test' });
		await fetchTemplateIndex(fetch, 'Texpile/test');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('reports a network failure as offline, and a bad answer as failed', async () => {
		const down = vi.fn(async () => {
			throw new TypeError('net::ERR_INTERNET_DISCONNECTED');
		});
		expect(await fetchTemplateIndex(down, 'ua')).toEqual({ ok: false, reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
		expect(await fetchTemplateIndex(async () => new Response('', { status: 503 }), 'ua')).toEqual({
			ok: false,
			reason: 'failed',
			error: 'HTTP 503'
		});
		expect((await fetchTemplateIndex(async () => new Response('<html>', { status: 200 }), 'ua')).ok).toBe(false);
		expect((await fetchTemplateIndex(async () => new Response('[]', { status: 200 }), 'ua')).ok).toBe(false);
	});
});

describe('fetchThumbnail', () => {
	it('returns image bytes, and nothing for anything else', async () => {
		const png = new Uint8Array([137, 80, 78, 71]);
		const ok = await fetchThumbnail(async () => new Response(png, { headers: { 'content-type': 'image/webp' } }), 'ua', 'a', '1.0.0');
		expect(ok).toEqual({ ok: true, bytes: png, type: 'image/webp' });
		expect(await fetchThumbnail(async () => new Response('x', { headers: { 'content-type': 'text/html' } }), 'ua', 'a', '1.0.0')).toEqual({
			ok: false
		});
		const never = vi.fn();
		expect(await fetchThumbnail(never, 'ua', 'a/../b', '1.0.0')).toEqual({ ok: false });
		expect(never).not.toHaveBeenCalled();
	});
});

describe('staging a Typst Universe template', () => {
	let base: string;
	beforeEach(() => {
		base = mkdtempSync(join(tmpdir(), 'texpile-staging-'));
	});
	afterEach(() => rmSync(base, { recursive: true, force: true }));

	it('moves what tinymist unpacked into the project, keeping the user files', async () => {
		const templates = join(base, 'templates');
		const root = join(base, 'project');
		mkdirSync(join(root, '.git'), { recursive: true });
		writeFileSync(join(root, 'main.typ'), 'mine');
		const staged = await createStagedDir(templates);
		mkdirSync(join(staged, 'sub'));
		writeFileSync(join(staged, 'main.typ'), 'theirs');
		writeFileSync(join(staged, 'sub', 'data.txt'), 'x');
		await adoptStagedDir(templates, staged, root);
		expect(readFileSync(join(root, 'main.typ'), 'utf8')).toBe('mine');
		expect(readFileSync(join(root, 'sub', 'data.txt'), 'utf8')).toBe('x');
		expect(existsSync(staged)).toBe(false);
	});

	it('refuses a folder that is not one of its own', async () => {
		const templates = join(base, 'templates');
		await expect(adoptStagedDir(templates, base, join(base, 'x'))).rejects.toThrow();
		await expect(discardStagedDir(templates, join(templates, '.staging', '..', '..'))).rejects.toThrow();
		const staged = await createStagedDir(templates);
		await discardStagedDir(templates, staged);
		expect(existsSync(staged)).toBe(false);
	});
});
