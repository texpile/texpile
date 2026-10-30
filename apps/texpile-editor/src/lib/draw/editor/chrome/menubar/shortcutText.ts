const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** a shortcut as the platform writes it: ⇧⌘Z on a Mac, Ctrl+Shift+Z elsewhere */
export function shortcutText(key: string, options: { shift?: boolean; alt?: boolean; mod?: boolean } = {}) {
	const mod = options.mod ?? true;
	if (IS_MAC) return `${options.alt ? '⌥' : ''}${options.shift ? '⇧' : ''}${mod ? '⌘' : ''}${key}`;
	return [mod ? 'Ctrl' : '', options.shift ? 'Shift' : '', options.alt ? 'Alt' : '', key].filter(Boolean).join('+');
}

export function redoShortcutText() {
	return IS_MAC ? shortcutText('Z', { shift: true }) : shortcutText('Y');
}
