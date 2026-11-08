<script lang="ts">
	import { texLiveInstaller } from './texLiveInstall.svelte';
	import { texLiveFailureText, texLiveStepText } from './texLiveInstallText';
	import InstallProgress from './InstallProgress.svelte';

	const failure = $derived(texLiveInstaller.failure);
	const year = $derived(texLiveInstaller.status?.year ?? 0);
</script>

<InstallProgress
	step={texLiveInstaller.step}
	describe={(step) => texLiveStepText(step, year)}
	failure={failure ? texLiveFailureText(failure) : null}
/>
