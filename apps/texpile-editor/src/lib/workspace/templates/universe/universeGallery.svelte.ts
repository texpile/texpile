// The Typst Universe template gallery: the list from packages.typst.org, searched, with the
// packages' own preview pictures. Nothing here touches the network until show() - opening the
// gallery is the user asking for it - and the pictures are fetched only for the cards on screen.
import { requireTemplatesBridge, bridgeErrorText } from '../templateBridge';
import { filterUniverse } from './universeFilter';
import type { UniverseTemplate } from '../templateBridge.types';

const PAGE = 24;
const THUMBNAIL_CONCURRENCY = 4;

export type GalleryStatus =
	| { kind: 'idle' }
	| { kind: 'loading' }
	| { kind: 'ready'; templates: UniverseTemplate[] }
	| { kind: 'error'; reason: 'offline' | 'failed'; error?: string };

/** the key a template's picture is kept under */
export function thumbnailKey(t: Pick<UniverseTemplate, 'name' | 'version'>): string {
	return `${t.name}@${t.version}`;
}

class UniverseGalleryState {
	open = $state(false);
	status = $state.raw<GalleryStatus>({ kind: 'idle' });
	query = $state('');
	shown = $state(PAGE);
	/** picture urls by thumbnailKey; '' when there is none to show */
	thumbnails = $state.raw<ReadonlyMap<string, string>>(new Map());

	readonly matches = $derived(this.status.kind === 'ready' ? filterUniverse(this.status.templates, this.query) : []);
	readonly visible = $derived(this.matches.slice(0, this.shown));

	private onPick: ((t: UniverseTemplate) => void) | null = null;
	private queue: UniverseTemplate[] = [];
	private requested = new Set<string>();
	private fetching = 0;

	show(onPick: (t: UniverseTemplate) => void): void {
		this.onPick = onPick;
		this.query = '';
		this.shown = PAGE;
		this.open = true;
		if (this.status.kind !== 'ready' && this.status.kind !== 'loading') void this.load();
	}

	hide(): void {
		this.open = false;
		this.onPick = null;
		// pictures asked for but not started are not needed any more; the next open asks again
		for (const t of this.queue) this.requested.delete(thumbnailKey(t));
		this.queue = [];
	}

	async load(): Promise<void> {
		this.status = { kind: 'loading' };
		try {
			const res = await requireTemplatesBridge().universeIndex();
			this.status = res.ok ? { kind: 'ready', templates: res.templates } : { kind: 'error', reason: res.reason, error: res.error };
		} catch (e) {
			this.status = { kind: 'error', reason: 'failed', error: bridgeErrorText(e) };
		}
	}

	setQuery(query: string): void {
		this.query = query;
		this.shown = PAGE;
	}

	showMore(): void {
		this.shown += PAGE;
	}

	pick(t: UniverseTemplate): void {
		const onPick = this.onPick;
		this.hide();
		onPick?.(t);
	}

	/** a card came on screen: fetch its picture, a few at a time */
	wantThumbnail(t: UniverseTemplate): void {
		const key = thumbnailKey(t);
		if (!this.open || this.requested.has(key)) return;
		this.requested.add(key);
		if (!t.thumbnail) return this.setThumbnail(key, '');
		this.queue = [...this.queue, t];
		this.pump();
	}

	private pump(): void {
		while (this.open && this.fetching < THUMBNAIL_CONCURRENCY && this.queue.length) {
			const [next, ...rest] = this.queue;
			this.queue = rest;
			this.fetching++;
			void this.fetchThumbnail(next).finally(() => {
				this.fetching--;
				this.pump();
			});
		}
	}

	private async fetchThumbnail(t: UniverseTemplate): Promise<void> {
		const got = await requireTemplatesBridge()
			.universeThumbnail(t.name, t.version)
			.catch(() => ({ ok: false as const }));
		const url = got.ok ? URL.createObjectURL(new Blob([got.bytes as BlobPart], { type: got.type })) : '';
		this.setThumbnail(thumbnailKey(t), url);
	}

	private setThumbnail(key: string, url: string): void {
		this.thumbnails = new Map(this.thumbnails).set(key, url);
	}
}

export const universeGallery = new UniverseGalleryState();
