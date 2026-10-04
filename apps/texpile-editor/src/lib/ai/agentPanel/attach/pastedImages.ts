// images for the agent: read from a paste, a drop or the file picker, shown as pictures, and sent as image blocks
import type { PastedImage } from '../agentPanel.types';

/** what agents read; an SVG or a TIFF would be refused by the model behind them */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function base64(bytes: Uint8Array): string {
	let binary = '';
	// in slices: one call per byte is slow, and one call for all of them overflows the stack on a large screenshot
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** the images among some files; none when a paste holds only text, which then pastes as usual */
export function imageFiles(files: FileList | null | undefined): File[] {
	return [...(files ?? [])].filter((f) => IMAGE_TYPES.includes(f.type));
}

export async function readImage(file: File): Promise<PastedImage> {
	const bitmap = await createImageBitmap(file).catch(() => null);
	const size = bitmap ? { width: bitmap.width, height: bitmap.height } : null;
	bitmap?.close();
	const bytes = new Uint8Array(await file.arrayBuffer());
	// a screenshot on the clipboard comes as image.png, as other apps name it
	return { name: file.name || 'image.png', mimeType: file.type, base64: base64(bytes), size };
}

/** for an <img> */
export function imageUrl(image: PastedImage): string {
	return `data:${image.mimeType};base64,${image.base64}`;
}

export function imageBlocks(images: PastedImage[]): unknown[] {
	// eslint-disable-next-line id-denylist -- `data` is the ACP image block's field for the base64 bytes
	return images.map((i) => ({ type: 'image', mimeType: i.mimeType, data: i.base64 }));
}
