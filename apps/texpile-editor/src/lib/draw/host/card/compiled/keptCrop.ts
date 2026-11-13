// a picture cropped from the PDF, in the form the drawing cache keeps: an image inside an svg of its size
export function cropSvg(dataUrl: string, width: number, height: number): string {
	const [w, h] = [Math.round(width * 100) / 100, Math.round(height * 100) / 100];
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="${dataUrl}"/></svg>`;
}

/** whether a cached drawing is a kept crop, which a compile that is current shows in its place */
export function isCropSvg(svg: string): boolean {
	return /^<svg[^>]*><image /.test(svg);
}

export function blobDataUrl(blob: Blob): Promise<string | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}
