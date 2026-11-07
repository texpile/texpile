import { collabHost } from '$lib/collab/hostStore.svelte';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { fileService } from '$lib/files/service/fileService';
import { pdfStore } from '$lib/stores/pdfStore';
import { activeFilePath, isDirty, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { synctexForward } from '$lib/workspace/synctex';
import { pictureOfCard } from '../../anchor/figureAnchors';
import { cachedDrawing, drawingTime } from '../../drawingCache';
import { chooseShown, isPdfCurrent } from './compiledFreshness';
import { pictureLines, regionFromBoxes, type PageRegion } from './pictureRegion';
import { renderPictureCrop, type PictureCrop } from './renderPictureCrop';

export type CompiledSource = { pdfPath(): string | null };

export type CardPicture = { svg: string | null; compiled: PictureCrop | null };

const REGIONS_KEPT = 200;

const regions = new Map<string, Promise<PageRegion | null>>();
const changes = new EventTarget();
let source: CompiledSource | null = null;
let stopWatching: (() => void) | null = null;
let listeners = 0;

export function setCompiledSource(next: CompiledSource | null): void {
	source = next;
	changes.dispatchEvent(new Event('change'));
}

function watch(): void {
	stopWatching = $effect.root(() => {
		$effect(() => {
			void pdfStore.current;
			void isDirty.current;
			changes.dispatchEvent(new Event('change'));
		});
	});
}

export function onCompiledChange(run: () => void): () => void {
	if (listeners++ === 0) watch();
	changes.addEventListener('change', run);
	return () => {
		changes.removeEventListener('change', run);
		if (--listeners === 0) {
			stopWatching?.();
			stopWatching = null;
		}
	};
}

function regionOf(pdf: string, mtimeMs: number, file: string, first: number, last: number): Promise<PageRegion | null> {
	const key = `${pdf}|${Math.round(mtimeMs)}|${file}|${first}-${last}`;
	let hit = regions.get(key);
	if (!hit) {
		hit = Promise.all([synctexForward(pdf, file, first), synctexForward(pdf, file, last)])
			.then(([a, b]) => regionFromBoxes([...(a.boxes ?? []), ...(b.boxes ?? [])]))
			.catch(() => null);
		regions.set(key, hit);
		if (regions.size > REGIONS_KEPT) regions.delete(regions.keys().next().value!);
	}
	return hit;
}

async function compiledPicture(picture: string, index: number): Promise<{ crop: PictureCrop; pdfMtimeMs: number } | null> {
	const pdf = source?.pdfPath();
	const file = activeFilePath.current;
	if (!pdf || !file || workspaceRoot.current === GUEST_ROOT || isDirty.current) return null;
	const ytext = collabHost.collabFor(file)?.ytext;
	if (!ytext) return null;
	const text = ytext.toString();
	const span = pictureOfCard(file, text, { index, source: picture });
	if (!span) return null;
	const [pdfStat, fileStat, mainStat] = await Promise.all([
		fileService.stat(pdf),
		fileService.stat(file),
		mainFile.current ? fileService.stat(mainFile.current) : null
	]);
	if (!pdfStat.exists) return null;
	if (!isPdfCurrent(pdfStat.mtimeMs, [fileStat.mtimeMs, mainStat?.mtimeMs ?? 0])) return null;
	const { first, last } = pictureLines(text, span.from, span.to);
	const region = await regionOf(pdf, pdfStat.mtimeMs, file, first, last);
	if (!region) return null;
	const url = fileService.fileUrl(pdf) + '&t=' + Math.round(pdfStat.mtimeMs);
	const crop = await renderPictureCrop(pdf, url, pdfStat.mtimeMs, region);
	return crop && { crop, pdfMtimeMs: pdfStat.mtimeMs };
}

export async function resolveCardPicture(key: string, picture: string, index: number): Promise<CardPicture> {
	const compiled = await compiledPicture(picture, index).catch(() => null);
	const svg = cachedDrawing(key);
	return chooseShown(svg, drawingTime(key), compiled?.crop ?? null, compiled?.pdfMtimeMs ?? 0);
}
