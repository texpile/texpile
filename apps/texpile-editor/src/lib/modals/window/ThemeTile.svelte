<script lang="ts">
	// A theme drawn as a miniature window: its ground, a sidebar in its panel colour, two lines in
	// its text colour and a button in its primary. What a tile can show of the app it would give you.
	let {
		ground,
		panel,
		text,
		accent,
		class: cls = ''
	}: { ground: string; panel: string; text: string; accent: string; class?: string } = $props();
</script>

<span class="block overflow-hidden {cls}" style="background: {ground}">
	<span class="relative block h-full w-full">
		<span class="absolute inset-y-0 left-0 w-[30%]" style="background: {panel}"></span>
		<span class="absolute top-[24%] left-[42%] h-[9%] w-[40%] rounded-full opacity-70" style="background: {text}"></span>
		<span class="absolute top-[42%] left-[42%] h-[9%] w-[26%] rounded-full opacity-40" style="background: {text}"></span>
		<span class="absolute bottom-[18%] left-[42%] h-[16%] w-[30%] rounded-full" style="background: {accent}"></span>
	</span>
</span>
