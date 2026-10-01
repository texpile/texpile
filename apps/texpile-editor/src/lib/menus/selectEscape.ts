// Escape closes an open select's list and nothing under it. The list is drawn in the page (app.css, base-select), so the
// key went on to the dialog or popover holding the select and closed that too, which the system's own list never let it.
// Stopped on the way down, before any of them hears it; closing the list is the browser's default action, which runs anyway
window.addEventListener(
	'keydown',
	(e) => {
		if (e.key === 'Escape' && document.querySelector('select:open')) e.stopPropagation();
	},
	true
);
