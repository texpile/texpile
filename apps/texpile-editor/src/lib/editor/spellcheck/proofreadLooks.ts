// prosemirror-proofread's marks on the canvas: a solid rule under the words, in the color of their kind
import type { DecorationLook } from '$lib/editor/canvas';
import { registerDecorationLook, registerDecorationLookPrefix } from '$lib/editor/canvas';

function proofLook(token: string, tint = token): DecorationLook {
	return {
		look: {
			borderBottom: `2px solid var(${token})`,
			cursor: 'pointer'
		},
		hover: { backgroundColor: `color-mix(in srgb, var(${tint}) 12%, transparent)` }
	};
}

const KINDS: Record<string, DecorationLook> = {
	spelling: proofLook('--proof-spelling'),
	typo: proofLook('--proof-typo', '--proof-spelling'),
	capitalization: proofLook('--proof-capitalization'),
	wordchoice: proofLook('--proof-wordchoice'),
	style: proofLook('--proof-style'),
	repetition: proofLook('--proof-repetition')
};

export function registerProofreadLooks(): void {
	for (const [kind, look] of Object.entries(KINDS)) registerDecorationLook(`proofread-${kind}`, look);
	registerDecorationLookPrefix('proofread-', proofLook('--proof-default'));
}
