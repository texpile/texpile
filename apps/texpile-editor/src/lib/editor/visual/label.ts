type LabelType = 'figure' | 'equation' | 'table' | 'ref' | 'citation';

/** short unique label, format texpile-{type}-{12 hex chars}. */
export function generateLabel(type: LabelType): string {
	const segments = crypto.randomUUID().split('-');
	const shortId = segments[0] + segments[1].slice(0, 4);

	const prefix = type === 'figure' ? 'fig' : type === 'equation' ? 'eq' : type === 'citation' ? 'cite' : type;
	return `texpile-${prefix}-${shortId}`;
}

export function isTexpileLabel(label: string | null | undefined): boolean {
	return !!label && label.startsWith('texpile-');
}

/** 12 hex chars for keeping duplicated labels unique. */
export function generateCopySuffix(): string {
	const segments = crypto.randomUUID().split('-');
	return segments[0] + segments[1].slice(0, 4);
}

export function sanitizeLabel(label: string): string {
	return label.trim().replace(/[^a-zA-Z0-9-_:]/g, '');
}

// "is this name taken" now lives in labelTaken.ts, which asks across every kind of anchor rather
// than one node type at a time - two anchors of different kinds sharing a name are just as
// ambiguous as two of the same.
