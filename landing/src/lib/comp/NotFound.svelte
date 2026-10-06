<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.notfound_title()}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="bg-surface-50 grid flex-1 place-items-center">
	<div class="container mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
		<p class="text-primary-600 text-sm font-semibold tracking-wide">{m.notfound_eyebrow()}</p>
		<h1 class="mt-2 text-3xl font-bold md:text-4xl">{m.notfound_heading()}</h1>
		<p class="text-surface-600 mx-auto mt-4 max-w-xl">{m.notfound_body()}</p>
		<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
			<a href={localizeHref('/')} class="btn preset-filled-primary-500 rounded-base px-5 py-2.5 text-sm font-semibold text-white"
				>{m.notfound_back_home()}</a
			>
			<a href={localizeHref('/download')} class="btn preset-outlined-primary-500 rounded-base px-5 py-2.5 text-sm font-medium"
				>{m.notfound_download()}</a
			>
		</div>
	</div>
</section>
