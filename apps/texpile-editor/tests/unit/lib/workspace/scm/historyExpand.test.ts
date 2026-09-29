// @vitest-environment jsdom
// Opening a version reads what differs between it and the working copy, which takes a few ms. The
// row must not expand until that answer is in: an empty lane that fills a frame later twitches, and
// the graph rail changes length with it. Past 300ms the row opens regardless, or a slow read is a
// click that did nothing.
//
// The rest is what a click during a read can do to the one open at a time: land after a second
// version was asked for, or after the version it belongs to was given up on.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoryTimeline from '$lib/workspace/scm/ui/graph/HistoryTimeline.svelte';
import type { GitFileChange, GitLogEntry } from '$lib/workspace/scm/git';
import { m } from '$lib/paraglide/messages';

const entry = (hash: string, subject: string): GitLogEntry => ({
	hash,
	short: hash.slice(0, 7),
	subject,
	author: 'Ada',
	date: '2026-01-02T03:04:05Z',
	parentCount: 1
});
const HISTORY = [entry('aaaaaaa1', 'second'), entry('bbbbbbb2', 'first')];

const file = (path: string): GitFileChange => ({ path, status: 'M' });

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

let host: HTMLDivElement;
let app: unknown = null;
/** every read handed out, newest last, so a test can resolve them out of order */
let reads: { hash: string; resolve: (v: GitFileChange[]) => void }[] = [];

beforeEach(() => {
	vi.useFakeTimers();
	reads = [];
	host = document.createElement('div');
	document.body.appendChild(host);
	if (!globalThis.ResizeObserver) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	}
});

afterEach(() => {
	if (app) unmount(app as Record<string, unknown>);
	app = null;
	host.remove();
	vi.useRealTimers();
});

function render() {
	app = mount(HistoryTimeline, {
		target: host,
		props: {
			history: HISTORY,
			busy: false,
			onLoadChanges: (hash: string) => {
				const d = deferred<GitFileChange[]>();
				reads.push({ hash, resolve: d.resolve });
				return d.promise;
			},
			onCompare: () => {},
			onRestore: () => {},
			baseName: (p: string) => p.split('/').pop() ?? p,
			dirName: () => ''
		}
	});
	flushSync();
}

/** the version rows, in order; the trailing menu trigger of each is a separate button */
function versionRow(i: number): HTMLElement {
	const rows = [...host.querySelectorAll('button')].filter((b) => HISTORY.some((e) => b.textContent?.includes(e.subject)));
	const row = rows[i];
	if (!row) throw new Error(`no version row ${i}`);
	return row;
}

function click(el: HTMLElement) {
	el.click();
	flushSync();
}

/** the promise callbacks queued behind an await, without letting the 300ms timer run */
async function settle() {
	await Promise.resolve();
	await Promise.resolve();
	flushSync();
}

const shown = () => host.textContent ?? '';
const isLoading = () => shown().includes(m.vcs_loading_changes());

describe('opening a version in the timeline', () => {
	it('stays shut until the list is ready, then opens already filled', async () => {
		render();
		click(versionRow(0));
		// the read is in flight: nothing is open, and in particular nothing is open and empty
		expect(isLoading()).toBe(false);
		expect(shown()).not.toContain(m.vcs_no_changes_since());
		expect(shown()).not.toContain('alpha.tex');

		reads[0].resolve([file('/w/alpha.tex'), file('/w/beta.tex')]);
		await settle();
		expect(shown()).toContain('alpha.tex');
		expect(shown()).toContain('beta.tex');
		expect(isLoading()).toBe(false);
	});

	it('opens on its own past 300ms, so a slow read is not a dead click', async () => {
		render();
		click(versionRow(0));
		expect(isLoading()).toBe(false);

		await vi.advanceTimersByTimeAsync(300);
		flushSync();
		expect(isLoading()).toBe(true);

		reads[0].resolve([file('/w/alpha.tex')]);
		await settle();
		expect(isLoading()).toBe(false);
		expect(shown()).toContain('alpha.tex');
	});

	it('a read that lands after another version was asked for does not open its own', async () => {
		render();
		click(versionRow(0));
		click(versionRow(1));
		expect(reads.map((r) => r.hash)).toEqual([HISTORY[0].hash, HISTORY[1].hash]);

		reads[0].resolve([file('/w/stale.tex')]);
		await settle();
		expect(shown()).not.toContain('stale.tex');

		reads[1].resolve([file('/w/wanted.tex')]);
		await settle();
		expect(shown()).toContain('wanted.tex');
	});

	it('a version given up on mid-read does not open when it lands', async () => {
		render();
		click(versionRow(0));
		click(versionRow(0)); // clicked again before it opened: cancels it
		reads[0].resolve([file('/w/alpha.tex')]);
		await settle();
		expect(shown()).not.toContain('alpha.tex');

		// and the 300ms opener was called off with it
		await vi.advanceTimersByTimeAsync(300);
		flushSync();
		expect(isLoading()).toBe(false);
	});

	it('closes an open version without reading it again', async () => {
		render();
		click(versionRow(0));
		reads[0].resolve([file('/w/alpha.tex')]);
		await settle();
		expect(shown()).toContain('alpha.tex');

		click(versionRow(0));
		expect(shown()).not.toContain('alpha.tex');
		expect(reads).toHaveLength(1);
	});

	it('says so when a version and the working copy agree', async () => {
		render();
		click(versionRow(0));
		reads[0].resolve([]);
		await settle();
		expect(shown()).toContain(m.vcs_no_changes_since());
	});
});
