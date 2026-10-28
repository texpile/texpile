import type * as Y from 'yjs';

class LiveValue {
	value = $state('');
	/** goes up by one with every change */
	version = $state(0);
	constructor(initial: string) {
		this.value = initial;
	}
}

const values = new WeakMap<Y.Text, LiveValue>();

function liveOf(text: Y.Text): LiveValue {
	let live = values.get(text);
	if (!live) {
		const made = new LiveValue(text.toString());
		text.observe(() => {
			made.value = text.toString();
			made.version++;
		});
		values.set(text, made);
		live = made;
	}
	return live;
}

/** a Y.Text's content as Svelte state, one per text however many read it */
export function liveText(text: Y.Text): string {
	return liveOf(text).value;
}

/** the number of changes the text has had since anything read it */
export function textVersion(text: Y.Text): number {
	return liveOf(text).version;
}
