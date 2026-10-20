<script lang="ts">
	import { settings, updateSettings, type AppSettings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';
	import { keymapOptions } from '../prefsOptions';
	import PrefsHeading from '../rows/PrefsHeading.svelte';
	import PrefsSelectRow from '../rows/PrefsSelectRow.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';

	const hyphenWhy = $derived(settings.current.visualJustify === false ? m.prefs_visual_hyphenate_needs_justify() : '');
</script>

<PrefsSwitchRow id="comment-pill" checked={settings.current.commentPill !== false} onChange={(v) => updateSettings({ commentPill: v })} />
<PrefsSwitchRow id="smart-paste" checked={settings.current.smartPaste !== false} onChange={(v) => updateSettings({ smartPaste: v })} />
<PrefsSelectRow
	id="keybindings"
	value={settings.current.editorKeymap ?? 'default'}
	options={keymapOptions()}
	onChange={(v) => updateSettings({ editorKeymap: v as AppSettings['editorKeymap'] })}
/>
<PrefsHeading section="source" />
<div class="pl-4">
	<PrefsSwitchRow
		id="source-line-wrap"
		checked={settings.current.sourceLineWrap !== false}
		onChange={(v) => updateSettings({ sourceLineWrap: v })}
	/>
	<PrefsSwitchRow id="math-preview" checked={settings.current.mathPreview !== false} onChange={(v) => updateSettings({ mathPreview: v })} />
	<PrefsSwitchRow
		id="auto-fraction"
		checked={settings.current.autoFraction === true}
		onChange={(v) => updateSettings({ autoFraction: v })}
	/>
	<PrefsSwitchRow id="tab-out" checked={settings.current.tabOut === true} onChange={(v) => updateSettings({ tabOut: v })} />
	<PrefsSwitchRow id="matrix-keys" checked={settings.current.matrixKeys === true} onChange={(v) => updateSettings({ matrixKeys: v })} />
</div>
<PrefsHeading section="visual" />
<div class="pl-4">
	<PrefsSwitchRow
		id="visual-justify"
		checked={settings.current.visualJustify !== false}
		onChange={(v) => updateSettings({ visualJustify: v })}
	/>
	<!-- only justified text is hyphenated, so the row is grayed with why while that is off -->
	<PrefsSwitchRow
		id="visual-hyphenate"
		checked={settings.current.visualHyphenate !== false}
		onChange={(v) => updateSettings({ visualHyphenate: v })}
		why={hyphenWhy}
	/>
</div>
