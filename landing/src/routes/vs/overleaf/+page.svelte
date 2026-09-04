<script lang="ts">
	import VsPage from '$lib/comp/VsPage.svelte';
</script>

<VsPage
	vs={{
		name: 'Overleaf',
		url: 'https://www.overleaf.com/',
		path: '/vs/overleaf',
		title: 'Texpile vs Overleaf: the desktop LaTeX editor alternative',
		description:
			'Texpile and Overleaf side by side: where files live, compile limits, live preview, collaboration, comments, cost. One on your computer, one in the browser.',
		lead: 'Overleaf is the browser editor: nothing to install, collaboration built in, and the compile runs on its servers. Texpile runs on your own computer: the files stay in a folder you choose, your own TeX distribution compiles them, and there is no account.',
		pitch:
			'Texpile is a desktop alternative to Overleaf. If you like writing in Overleaf but want the document on your own machine, no compile timeout, and real-time collaboration that is end to end encrypted, you should try Texpile. If you write confidential documents, you should try Texpile.',
		rows: [
			{ label: 'Runs on', texpile: 'Windows, macOS, Linux', other: 'A browser' },
			{ label: 'Price', texpile: 'Free, AGPL-3.0', other: 'Free plan; Standard $25 a month', better: 'texpile' },
			{ label: 'Where the files live', texpile: 'In a folder on your computer', other: "On Overleaf's servers", better: 'texpile' },
			{
				label: 'Compile',
				texpile: 'Your own TeX distribution, no time limit',
				other: "On Overleaf's servers, 10 s limit on the free plan, 240 s on paid plans",
				better: 'texpile'
			},
			{
				label: 'Visual editing',
				texpile: 'A real document editor over the .tex file: citations, merged table cells, aligned equations',
				other: 'The Visual Editor: a code editor that renders some markup, raw LaTeX for the rest',
				better: 'texpile'
			},
			{ label: 'Live preview', texpile: 'The page re-typesets as you type', other: 'The PDF after a compile', better: 'texpile' },
			{
				label: 'Collaboration',
				texpile: 'Real time, end to end encrypted, no account for guests',
				other: 'Real time; one collaborator per project on the free plan'
			},
			{ label: 'Comments', texpile: 'Yes', other: 'Yes' },
			{ label: 'Git support', texpile: 'Built in: save versions, restore', other: 'Git and GitHub sync on paid plans', better: 'texpile' },
			{
				label: 'Diff viewer',
				texpile: 'A visual diff against the last version, word by word',
				other: 'History for the previous 24 hours on the free plan'
			},
			{ label: 'Works offline', texpile: 'Yes, everything except shared sessions', other: 'No', better: 'texpile' },
			{ label: 'Setup', texpile: 'A TeX distribution to install', other: 'Nothing to install', better: 'other' }
		],
		sections: [
			{
				heading: 'The two visual editors',
				body: "Overleaf's Visual Editor renders markup inside a code editor, and for much of a real document you are back to editing raw LaTeX. Texpile's visual editor parses the LaTeX into a real document editor: citations, tables with merged cells, aligned equation environments, and many other advanced constructs are edited without touching LaTeX, and saved back to the same .tex file."
			}
		],
		theirs:
			'Overleaf needs nothing installed: open a link on any machine and the project is there, compiled on the server. It has a large template gallery, journal submission links, and track changes on paid plans. If the people you write with will not install anything, or the journal you submit to expects an Overleaf project, Overleaf is for you.',
		ours: "Texpile's flagship is the visual editor and the live preview. If you want the document on your own machine with no compile cut off after 10 seconds, changes typeset instantly by lualatex rather than after a compile, and collaboration where nobody needs an account, you should use Texpile."
	}}
/>
