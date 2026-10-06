// @vitest-environment jsdom
// The starter picker with templates in it: the user's saved ones under their own heading, per
// typesetter, and the Typst Universe gallery - which must not touch the network until it is
// opened, and must say so plainly when the network is not there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import StarterPicker from '$lib/workspace/StarterPicker.svelte';
import { universeGallery } from '$lib/workspace/templates/universe/universeGallery.svelte';
import type { StarterChoice } from '$lib/workspace/templates/starterChoice';
import type { TexpileTemplatesBridge, UniverseIndex, UniverseTemplate, UserTemplate } from '$lib/workspace/templates/templateBridge.types';

const SAVED: UserTemplate[] = [
	{ id: 'lab', name: 'Lab report', description: 'Our group style', lang: 'latex', mainFile: 'main.tex', createdAt: 1 },
	{ id: 'notes', name: 'Lecture notes', description: '', lang: 'typst', mainFile: 'main.typ', createdAt: 2 }
];

const TEMPLATES: UniverseTemplate[] = [
	{
		name: 'charged-ieee',
		version: '0.1.4',
		description: 'An IEEE-style paper',
		authors: ['Typst GmbH'],
		keywords: [],
		categories: ['paper'],
		thumbnail: false
	},
	{ name: 'modern-cv', version: '0.8.0', description: 'A resume', authors: [], keywords: [], categories: ['cv'], thumbnail: false }
];
const INDEX: UniverseIndex = { ok: true, templates: TEMPLATES };

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;
let bridge: { [K in keyof TexpileTemplatesBridge]: ReturnType<typeof vi.fn> };
let picked: StarterChoice[] = [];

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	bridge = {
		list: vi.fn(async () => SAVED),
		survey: vi.fn(),
		save: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
		apply: vi.fn(),
		stage: vi.fn(),
		adopt: vi.fn(),
		discard: vi.fn(),
		universeIndex: vi.fn(async () => INDEX),
		universeThumbnail: vi.fn(async () => ({ ok: false })),
		universeUnpack: vi.fn()
	};
	vi.stubGlobal('texpileTemplates', bridge);
	picked = [];
});

afterEach(() => {
	universeGallery.hide();
	universeGallery.status = { kind: 'idle' };
	if (app) unmount(app);
	app = null;
	host.remove();
	vi.unstubAllGlobals();
});

async function render(): Promise<void> {
	app = mount(StarterPicker, {
		target: host,
		props: { onPick: (c: StarterChoice) => picked.push(c), onBlank: () => {}, onImport: () => {} }
	}) as Record<string, unknown>;
	flushSync();
	await vi.waitFor(() => expect(bridge.list).toHaveBeenCalled());
	await tick();
	flushSync();
}

function text(): string {
	return document.body.textContent ?? '';
}

function button(label: string): HTMLButtonElement {
	const found = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
	if (!found) throw new Error(`no button "${label}"`);
	return found;
}

describe('StarterPicker with templates', () => {
	it('shows the saved templates of the open tab only, under their own heading', async () => {
		await render();
		expect(text()).toContain('Your Templates');
		expect(text()).toContain('Lab report');
		expect(text()).not.toContain('Lecture notes');
		button('Typst').click();
		flushSync();
		expect(text()).toContain('Lecture notes');
		expect(text()).not.toContain('Lab report');
		button('Lecture notes').click();
		expect(picked).toEqual([{ kind: 'saved', template: SAVED[1] }]);
	});

	it('offers the Typst starters and the gallery, which goes online only once opened', async () => {
		await render();
		expect(text()).not.toContain('Browse Typst Templates');
		button('Typst').click();
		flushSync();
		for (const name of ['Paper', 'Report or Thesis', 'Letter', 'Slides', 'Empty Document']) expect(text()).toContain(name);
		expect(bridge.universeIndex).not.toHaveBeenCalled();

		button('Browse Typst Templates').click();
		flushSync();
		expect(text()).toContain('packages.typst.org');
		await vi.waitFor(() => expect(text()).toContain('charged-ieee'));
		expect(bridge.universeIndex).toHaveBeenCalledTimes(1);

		button('modern-cv').click();
		flushSync();
		expect(picked).toEqual([{ kind: 'universe', template: TEMPLATES[1] }]);
		expect(text()).not.toContain('charged-ieee');
	});

	it('says when Typst Universe cannot be reached, and tries again on request', async () => {
		bridge.universeIndex.mockResolvedValueOnce({ ok: false, reason: 'offline', error: 'net::ERR_INTERNET_DISCONNECTED' });
		await render();
		button('Typst').click();
		flushSync();
		button('Browse Typst Templates').click();
		await vi.waitFor(() => expect(text()).toContain('Could not reach Typst Universe'));
		button('Try Again').click();
		await vi.waitFor(() => expect(text()).toContain('charged-ieee'));
		expect(bridge.universeIndex).toHaveBeenCalledTimes(2);
	});
});
