import { collabHost } from '$lib/collab/hostStore.svelte';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { fileService } from '$lib/files/service/fileService';
import { pdfStore } from '$lib/stores/pdfStore';
import { activeFilePath, isDirty, mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { synctexForward } from '$lib/workspace/synctex';
import { pictureOfCard } from '../../anchor/figureAnchors';
import { cachedDrawing, drawingTime, saveDrawing } from '../../drawingCache';
import { chooseShown, isPdfCurrent } from './compiledFreshness';
import { blobDataUrl, cropSvg, isCropSvg } from './keptCrop';
import { pictureLines, regionFromBoxes, type PageRegion } from './pictureRegion';
import { renderPictureCrop, type PictureCrop } from './renderPictureCrop';

export type CompiledSource = { pdfPath(): string | null };

export type CardPicture = { svg: string | null; compiled: PictureCrop | null };

const REGIONS_KEPT = 200;
const CROPS_NOTED = 400;

// the crops already kept, by their url
const kept = new Set<string>();

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

// The picture as the PDF printed it, kept under its source as a figure tab's drawing is. An edit elsewhere in the file or
// a reload leaves the PDF older than the file, and the card had nothing to show until the next compile
async function keepCompiled(key: string, crop: PictureCrop): Promise<void> {
	if (kept.has(crop.url)) return;
	if (kept.size > CROPS_NOTED) kept.clear();
	kept.add(crop.url);
	const blob = await fetch(crop.url)
		.then((answer) => answer.blob())
		.catch(() => null);
	const image = blob && (await blobDataUrl(blob));
	if (image) saveDrawing(key, cropSvg(image, crop.width, crop.height));
}

export async function resolveCardPicture(key: string, picture: string, index: number): Promise<CardPicture> {
	const compiled = await compiledPicture(picture, index).catch(() => null);
	const cached = cachedDrawing(key);
	const drawn = cached && !isCropSvg(cached) ? cached : null;
	const shown = chooseShown(drawn, drawingTime(key), compiled?.crop ?? null, compiled?.pdfMtimeMs ?? 0);
	if (!shown.compiled) return { svg: cached, compiled: null };
	void keepCompiled(key, shown.compiled);
	return shown;
}
