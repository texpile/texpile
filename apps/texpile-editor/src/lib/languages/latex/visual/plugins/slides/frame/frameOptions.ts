export type FrameOptionParts = { overlay: string; defaultOverlay: string; keys: string[] };

const SHAPE = /^(<[^>]*>)?(?:\[(<[^\]]*>)\])?(?:\[([^\]]*)\])?$/;

export function frameOptionParts(options: string): FrameOptionParts | null {
	const match = SHAPE.exec(options.trim());
	if (!match) return null;
	return {
		overlay: match[1] ?? '',
		defaultOverlay: match[2] ?? '',
		keys: (match[3] ?? '')
			.split(',')
			.map((key) => key.trim())
			.filter(Boolean)
	};
}

export function frameOptionsText(parts: FrameOptionParts): string {
	const keys = parts.keys.join(',');
	return `${parts.overlay}${parts.defaultOverlay ? `[${parts.defaultOverlay}]` : ''}${keys ? `[${keys}]` : ''}`;
}

export function keyName(key: string): string {
	return key.split('=')[0].trim();
}
