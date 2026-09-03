<script lang="ts">
	import { Download, RefreshCw, ExternalLink } from '@lucide/svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { settings, updateSettings } from '$lib/settings';
	// eslint-disable-next-line no-restricted-imports -- this modal IS the desktop updater's UI; a web entry never mounts it
	import { updateState, updateModalOpen, startDownload, installNow } from '$lib/updates';
	import { m } from '$lib/paraglide/messages';

	const u = $derived(updateState.current);
	const pkexec = $derived(u.installMode === 'package-manager');
	const title = $derived(
		u.phase === 'downloading'
			? m.updatemodal_title_downloading()
			: u.phase === 'downloaded'
				? m.updatemodal_title_downloaded()
				: u.phase === 'error'
					? m.updatemodal_title_error()
					: m.updatemodal_title_available()
	);

	function close() {
		updateModalOpen.current = false;
	}
	function openDownloadPage() {
		close();
		window.open('https://texpile.com/download', '_blank', 'noopener,noreferrer');
	}
	function mb(n: number): string {
		return (n / 1048576).toFixed(1);
	}
</script>

{#if u.phase !== 'idle'}
	<Modal bind:open={updateModalOpen.current} {title} icon={Download} card="flex max-h-full max-w-md flex-col p-5">
		{#if u.phase === 'available'}
			<p class="text-muted mb-4 text-sm">{m.updatemodal_version_available({ version: u.version ?? '' })}</p>
			{#if u.notes?.length}
				<ul class="text-muted mb-4 min-h-0 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
					{#each u.notes as note (note)}
						<li>{note}</li>
					{/each}
				</ul>
			{/if}
			<div class="mb-4 flex items-center justify-between gap-4">
				<span class="text-sm">{m.updatemodal_check_updates_on_launch()}</span>
				<Switch checked={settings.current.checkForUpdates} onCheckedChange={(d) => updateSettings({ checkForUpdates: d.checked })}>
					<Switch.Control><Switch.Thumb /></Switch.Control>
					<Switch.HiddenInput />
				</Switch>
			</div>
			<ModalActions
				size="xs"
				buttons={[
					{ label: m.updatemodal_dismiss(), role: 'cancel', onclick: close },
					{ label: m.updatemodal_download_update(), role: 'primary', icon: Download, onclick: () => startDownload() }
				]}
			/>
		{:else if u.phase === 'downloading'}
			<div class="bg-surface-200-800 mb-2 h-2 w-full overflow-hidden rounded-full">
				<div class="bg-primary-500 h-full rounded-full transition-[width] duration-300" style="width: {Math.max(2, u.percent)}%"></div>
			</div>
			<p class="text-muted mb-4 text-sm">
				{#if u.total > 0}
					{m.updatemodal_progress_percent({
						percent: Math.round(u.percent),
						transferred: mb(u.transferred),
						total: mb(u.total)
					})}
				{:else}
					{m.updatemodal_starting_download()}
				{/if}
			</p>
			<p class="text-muted mb-4 text-sm">{m.updatemodal_background_download_notice()}</p>
			<ModalActions size="xs" buttons={[{ label: m.updatemodal_hide(), role: 'cancel', onclick: close }]} />
		{:else if u.phase === 'downloaded'}
			{#if pkexec}
				<p class="text-muted mb-4 text-sm">
					{m.updatemodal_downloaded_pkexec({ version: u.version ?? '' })}
				</p>
				<ModalActions
					size="xs"
					buttons={[
						{ label: m.updatemodal_later(), role: 'cancel', onclick: close },
						{ label: m.updatemodal_install_now(), role: 'primary', icon: RefreshCw, onclick: installNow }
					]}
				/>
			{:else}
				<p class="text-muted mb-4 text-sm">{m.updatemodal_downloaded_ready({ version: u.version ?? '' })}</p>
				<ModalActions
					size="xs"
					buttons={[
						{ label: m.updatemodal_later(), role: 'cancel', onclick: close },
						{ label: m.updatemodal_restart_and_install(), role: 'primary', icon: RefreshCw, onclick: installNow }
					]}
				/>
			{/if}
		{:else if u.phase === 'error'}
			<p class="text-muted mb-4 text-sm">
				{m.updatemodal_download_error()}
			</p>
			{#if u.error}
				<p class="text-muted mb-4 text-xs break-words">{u.error}</p>
			{/if}
			<ModalActions
				size="xs"
				buttons={[
					{ label: m.updatemodal_close(), role: 'cancel', onclick: close },
					{ label: m.updatemodal_open_download_page(), role: 'primary', icon: ExternalLink, onclick: openDownloadPage }
				]}
			/>
		{/if}
	</Modal>
{/if}
