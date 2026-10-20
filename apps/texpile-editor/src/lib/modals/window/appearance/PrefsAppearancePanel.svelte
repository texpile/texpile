<script lang="ts">
	import { Languages } from '@lucide/svelte';
	import { settings, updateSettings } from '$lib/settings';
	import { windowGlass } from '$lib/chrome/windowGlass.svelte';
	import { changeUiLocale, uiLocaleOptions } from '../prefsOptions';
	import AppearanceMode from '../AppearanceMode.svelte';
	import ThemePicker from '../ThemePicker.svelte';
	import PrefsRow from '../rows/PrefsRow.svelte';
	import PrefsSwitchRow from '../rows/PrefsSwitchRow.svelte';
	import { m } from '$lib/paraglide/messages';

	// the browser has no glass of its own; on the desktop it needs macOS or Windows 11 (windowGlass.ts)
	const glassUnavailable = $derived(windowGlass.works ? '' : __WEB__ ? m.unavailable_desktop() : m.prefs_window_transparency_unsupported());
</script>

<PrefsRow id="appearance-mode">
	<AppearanceMode />
</PrefsRow>
<ThemePicker />
<PrefsSwitchRow
	id="window-transparency"
	checked={windowGlass.works && settings.current.transparentWindow === true}
	onChange={(v) => updateSettings({ transparentWindow: v })}
	why={glassUnavailable}
/>
<!-- the one setting a user may need to find while the UI is in a language they cannot read, so it carries an icon the others do not -->
<PrefsRow id="ui-language" icon={Languages}>
	<!-- sized by its widest label: a fixed width ran long language names under the native arrow -->
	<select
		class="select w-auto min-w-32 text-sm"
		aria-label={m.prefs_language()}
		value={settings.current.uiLocale}
		onchange={changeUiLocale}
	>
		{#each uiLocaleOptions() as l (l.value)}
			<option value={l.value}>{l.label}</option>
		{/each}
	</select>
</PrefsRow>
