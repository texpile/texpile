-- Writes every SHIPPED PAGE's walker records + the pages.json manifest -- nothing else.
-- (Each page box is the engine's final exact layout: columns, floats, page breaks.)
-- Records go to <outdir>/page-NNN.jsonl. Registered from the .tex via the LaTeX kernel
-- shipout hook: \AddToHook{shipout/before}{\directlua{page_extract(\the\ShipoutBox)}}
--
-- Product config (set as Lua globals in the injecting job string before dofile):
--   TEXPILE_ENGINE_DIR -- absolute dir holding walker.lua (read-only; reads aren't
--                         sandboxed, so an absolute app-resources path is fine)
--   TEXPILE_DRAFT_OUT  -- relative subdir for the jsonl/manifest (writes ARE sandboxed;
--                         must be a relative path under cwd, e.g. "_draft")
-- ENGINE_DIR must be provided by the injecting job string; "." is only a last resort.
local ENGINE_DIR = TEXPILE_ENGINE_DIR or "."
local OUT = TEXPILE_DRAFT_OUT and (TEXPILE_DRAFT_OUT .. "/") or ""
local walker = dofile(ENGINE_DIR .. "/walker.lua")
local pageno = 0
local pages = {}

-- Rewrite the manifest after EVERY shipout: \AtEndDocument hooks run BEFORE the final
-- \clearpage ships the last page, so an end-of-run write would miss it (a one-page
-- document would report count 0). The manifest is tiny; per-page rewrite is free.
local function write_manifest()
	local f = io.open(OUT .. "pages.json", "w")
	if not f then return end
	-- paper dims in TeX pt (same unit as the walker's glyph coords, so the renderer needs
	-- no bp/pt conversion). LaTeX's \paperwidth/\paperheight are named dimens.
	local pw = (tex.dimen and tex.dimen["paperwidth"] or 0) / 65536.0
	local ph = (tex.dimen and tex.dimen["paperheight"] or 0) / 65536.0
	-- \columnwidth is the exact width TeX wrapped body text to (one column in twocolumn
	-- mode); the instant patch calibrates the warm daemon to this so it reproduces the
	-- page's line breaks. Falls back to \textwidth (single-column docs) then 0.
	local cw = (tex.dimen and (tex.dimen["columnwidth"] or tex.dimen["textwidth"]) or 0) / 65536.0
	-- \footskip separates the body bottom from the footer baseline (= the shipout box
	-- baseline, ht): body bottom in record space is ht - footskip
	local fsk = (tex.dimen and tex.dimen["footskip"] or 0) / 65536.0
	local t = {}
	for i = 1, pageno do t[i] = string.format('{"n":%d,"w":%.4f,"h":%.4f,"ht":%.4f}', i, pages[i].w, pages[i].h, pages[i].ht) end
	f:write(string.format('{"count":%d,"paperW":%.4f,"paperH":%.4f,"colW":%.4f,"footSkip":%.4f,"pages":[%s]}', pageno, pw, ph, cw, fsk, table.concat(t, ",")))
	f:close()
end

function page_extract(boxnum)
	local b = tex.box[boxnum]
	if not b then return end
	pageno = pageno + 1
	local ok, records = pcall(walker.lines, b.head)
	if ok then
		local f = io.open(string.format("%spage-%03d.jsonl", OUT, pageno), "w")
		if f then f:write(table.concat(records, "\n")); f:close() end
		pages[pageno] = { w = (b.width or 0) / 65536, h = ((b.height or 0) + (b.depth or 0)) / 65536, ht = (b.height or 0) / 65536 }
		write_manifest()
	end
end

-- kept for compatibility with existing wrappers; the real work happens per shipout
function page_extract_finish()
	write_manifest()
end
