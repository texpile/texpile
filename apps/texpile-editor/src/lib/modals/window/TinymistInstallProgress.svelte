<script lang="ts">
	import { tinymistInstaller } from './tinymistInstall.svelte';
	import { tinymistFailureText, tinymistStepText } from './tinymistInstallText';
	import InstallProgress from './toolchain/install/InstallProgress.svelte';

	const failure = $derived(tinymistInstaller.failure);
	const version = $derived(tinymistInstaller.status?.pinned ?? '');
</script>

<InstallProgress
	step={tinymistInstaller.step}
	describe={(step) => tinymistStepText(step, version)}
	failure={failure ? tinymistFailureText(failure) : null}
/>
