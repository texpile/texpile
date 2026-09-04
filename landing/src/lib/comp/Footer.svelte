<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import LogoLight from '$branding/Logo-light.svg';
</script>

<footer class="bg-ink-950 text-surface-100 py-14">
	<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
		<div class="grid grid-cols-1 gap-8 md:grid-cols-4">
			<div class="space-y-4">
				<img src={LogoLight} alt={m.footer_brand()} class="h-7" />
				<p class="text-surface-300">{m.footer_tagline()}</p>
			</div>

			<div class="space-y-4">
				<h4 class="font-semibold text-white">{m.footer_project_heading()}</h4>
				<ul class="space-y-2">
					<li>
						<a href="/docs" class="text-surface-300 hover:text-white">{m.footer_docs()}</a>
					</li>
					<li>
						<a href="/download" class="text-surface-300 hover:text-white">{m.footer_download()}</a>
					</li>
					<li>
						<a href="https://github.com/texpile/texpile" target="_blank" rel="noopener noreferrer" class="text-surface-300 hover:text-white"
							>{m.footer_source_code()}</a
						>
					</li>
				</ul>
			</div>

			<div class="space-y-4">
				<h4 class="font-semibold text-white">{m.footer_editors_heading()}</h4>
				<ul class="space-y-2">
					<li>
						<a href="/latex-editor" class="text-surface-300 hover:text-white">{m.footer_latex()}</a>
					</li>
					<li>
						<a href="/typst-editor" class="text-surface-300 hover:text-white">{m.footer_typst()}</a>
					</li>
				</ul>
			</div>

			<div class="space-y-4">
				<h4 class="font-semibold text-white">{m.footer_community_heading()}</h4>
				<ul class="space-y-2">
					<li>
						<a
							href="https://discord.com/invite/7wanVzCBWf"
							target="_blank"
							rel="noopener noreferrer"
							class="text-surface-300 hover:text-white">{m.footer_discord()}</a
						>
					</li>
				</ul>
			</div>
		</div>

		<div class="mt-10 border-t border-white/10 pt-8 text-center">
			<!-- no whitespace between the three parts: CJK locales must not get a space around the
			     link or before their fullwidth comma, so each locale carries its own spacing -->
			<p class="text-surface-400">
				{m.footer_license_pre()}<a
					href="https://github.com/texpile/texpile"
					target="_blank"
					rel="noopener noreferrer"
					class="hover:text-white underline">{m.footer_license_link()}</a
				>{m.footer_license_post()}
			</p>
		</div>
	</div>
</footer>
