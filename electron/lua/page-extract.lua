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

-- Seam capture: the vertical material TeX prunes at every column/page break (the glue
-- run that would sit at the junction if the break moved) plus the break's \outputpenalty.
-- \savingvdiscards makes the engine SAVE each break's pruned run (eTeX \pagediscards);
-- the run for the break that filled box255 is only complete at the NEXT output firing,
-- so each pre_output_filter snapshot belongs to the PREVIOUS firing's break. Real breaks
-- have \outputpenalty >= -10000; LaTeX's float/clearpage cycles run below that and get
-- no seam entry (their box255 is recycled, not a column).
local seam_pending, seam_done, seam_cols = nil, {}, 0
local GLUE_ID, KERN_ID, PEN_ID = node.id("glue"), node.id("kern"), node.id("penalty")

local function seam_run_json()
	local out, n, cnt = {}, tex.lists.page_discards_head, 0
	while n and cnt < 40 do
		if n.id == GLUE_ID then
			out[#out + 1] = string.format('{"w":%.4f,"st":%.4f,"sto":%d,"sh":%.4f,"sho":%d}',
				(n.width or 0) / 65536.0, (n.stretch or 0) / 65536.0, n.stretch_order or 0,
				(n.shrink or 0) / 65536.0, n.shrink_order or 0)
		elseif n.id == KERN_ID then
			out[#out + 1] = string.format('{"k":%.4f}', (n.kern or 0) / 65536.0)
		elseif n.id == PEN_ID then
			out[#out + 1] = string.format('{"p":%d}', n.penalty or 0)
		else
			-- the engine only saves glue/kern/penalty; anything else marks the run unusable
			out[#out + 1] = '{"x":true}'
		end
		n = n.next
		cnt = cnt + 1
	end
	-- a run longer than the cap is TRUNCATED, and a short seam is worse than no seam:
	-- poison it the same way an unrepresentable node does
	if n then out[#out + 1] = '{"x":true}' end
	return "[" .. table.concat(out, ",") .. "]"
end

-- Column identity: stamp every top-level node of the list becoming \box255 with the ordinal
-- of the firing that built it. At shipout the box still holding them IS a column, which is
-- how the walker names column origins from the engine instead of clustering glyph lefts.
-- Counted separately from seam_cols: that one skips float/clearpage cycles and resets per
-- page, while the stamp only has to be unique across the run.
local col_attr, col_firing = nil, 0

-- declared here, above the registration below, so the assignment there binds THESE locals:
-- declaring them after it would leave the registration writing globals while every reader
-- closes over locals that stay nil
local src_line_attr, src_file_attr
local src_files, src_filen = {}, 0

local function seam_mark(head)
	if col_attr then
		col_firing = col_firing + 1
		local n = head
		while n do
			node.set_attribute(n, col_attr, col_firing)
			n = n.next
		end
	end
	if seam_pending then
		seam_pending.run = seam_run_json()
		seam_done[#seam_done + 1] = seam_pending
		seam_pending = nil
	end
	local pen = tex.outputpenalty or 0
	if pen >= -10000 then
		seam_cols = seam_cols + 1
		seam_pending = { pen = pen, col = seam_cols }
	end
	return true
end

-- registration is best-effort: a build without luatexbase just compiles seamless.
-- The attribute gets its own pcall so that losing it cannot also cost us the seams.
pcall(function()
	col_attr = luatexbase.new_attribute("texpilecolumn")
	walker.colattr = col_attr
end)
pcall(function()
	src_line_attr = luatexbase.new_attribute("texpilesrcline")
	src_file_attr = luatexbase.new_attribute("texpilesrcfile")
	walker.srcline, walker.srcfile = src_line_attr, src_file_attr
end)
pcall(function()
	tex.set("global", "savingvdiscards", 1)
	luatexbase.add_to_callback("pre_output_filter", seam_mark, "texpile.seam")
end)

-- Source-line truth for the instant path: each paragraph stamps its own first source line
-- and file onto the nodes it produces, so the walker can say which line of the document a
-- line of the page came from. That is the question the locate tier answers today by
-- searching -- snapping synctex boxes to a baseline grid, fingerprinting glyph rows,
-- typesetting calibration variants against every column of every page.
--
-- The stamp is driven from Lua rather than TeX so the file table is built as a side effect
-- of stamping instead of needing a second channel. Line numbers are FILE-LOCAL (a paragraph
-- in an \input'ed fragment reports its line within that fragment), hence the file id.
--
-- Deliberately NOT covered: \item. Its paragraph starts late enough that \inputlineno has
-- moved on, so the second item of a list reports the first item's line, and nesting drifts
-- further (measured: up to 4 lines, with two items claiming the same line). Consumers verify
-- content before trusting a claim, so a list item simply fails that check and falls back to
-- the search; it is never mislocated.
function texpile_para()
	if not src_line_attr then return end
	local f = ((status and status.filename or ""):gsub("\\", "/"):match("[^/]+$") or ""):lower()
	local id = src_files[f]
	if not id then
		src_filen = src_filen + 1
		src_files[f] = src_filen
		id = src_filen
	end
	tex.setattribute(src_line_attr, tex.inputlineno)
	tex.setattribute(src_file_attr, id)
end

-- content outside any paragraph (a float caption, a running head) must read as UNKNOWN
-- rather than inherit the last paragraph's line and claim to be text it is not
function texpile_para_end()
	if not src_line_attr then return end
	tex.setattribute(src_line_attr, -2147483647)
	tex.setattribute(src_file_attr, -2147483647)
end

local function src_files_json()
	local inv = {}
	for f, i in pairs(src_files) do inv[i] = f end
	local t = {}
	for i = 1, src_filen do t[i] = '"' .. tostring(inv[i] or ""):gsub('[%c"\\]', "") .. '"' end
	return "[" .. table.concat(t, ",") .. "]"
end

-- Counter truth for the instant path: a snapshot of the standard counters at every
-- \stepcounter/\setcounter (the job string wraps them), keyed by source line + input
-- file. The daemon pins to these TRUE values, so a heading/footnote/item patch can
-- reproduce the page's own numbers and certify instead of rendering a pinned 0.
local COUNTER_NAMES = { "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph",
	"footnote", "enumi", "enumii", "enumiii", "enumiv", "figure", "table", "equation" }
local counter_have -- probed once: which of these this document defines
local counter_log = {}
local body_line

function texpile_begindoc(line)
	body_line = line
end

function texpile_counters(line)
	if not counter_have then
		counter_have = {}
		for _, nm in ipairs(COUNTER_NAMES) do
			if pcall(function() return tex.count["c@" .. nm] end) then counter_have[#counter_have + 1] = nm end
		end
	end
	local vals = {}
	for _, nm in ipairs(counter_have) do
		vals[#vals + 1] = string.format('"%s":%d', nm, tex.count["c@" .. nm])
	end
	local f = ((status and status.filename or ""):gsub("\\", "/"):match("[^/]+$") or ""):gsub('[%c"\\]', "")
	local entry = string.format('{"l":%d,"f":"%s","s":{%s}}', line, f:lower(), table.concat(vals, ","))
	-- \stepcounter chains snapshot identically; keep one
	if counter_log[#counter_log] ~= entry then counter_log[#counter_log + 1] = entry end
end

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
	-- \textwidth too: under twocolumn a starred float wraps at THIS width, not \columnwidth,
	-- and the instant path needs the engine's value to calibrate full-width bands
	local tw = (tex.dimen and tex.dimen["textwidth"] or 0) / 65536.0
	-- \footskip separates the body bottom from the footer baseline (= the shipout box
	-- baseline, ht): body bottom in record space is ht - footskip
	local fsk = (tex.dimen and tex.dimen["footskip"] or 0) / 65536.0
	-- more engine registers the instant path used to guess: \columnsep (column origin
	-- synthesis), \baselineskip and \parskip (line-gap fallbacks and flow-gap bounds)
	local csep = (tex.dimen and tex.dimen["columnsep"] or 0) / 65536.0
	-- \hoffset/\voffset displace the page's reference point away from TeX's 1in default.
	-- The renderer used to assume the default for every document, so a class or preamble
	-- that moves the origin painted every page displaced with nothing able to detect it.
	local hoff, voff = 0, 0
	pcall(function() hoff = tex.dimen["hoffset"] / 65536.0 end)
	pcall(function() voff = tex.dimen["voffset"] / 65536.0 end)
	local bls, pks, tsk = 0, 0, 0
	pcall(function() bls = tex.getglue("baselineskip") / 65536.0 end)
	pcall(function() pks = tex.getglue("parskip") / 65536.0 end)
	-- \topskip governs where a column's FIRST baseline lands: the chain planner needs it
	-- to place carried lines at a receiving column's top the way the page builder would
	pcall(function() tsk = tex.getglue("topskip") / 65536.0 end)
	local t = {}
	for i = 1, pageno do
		local p = pages[i]
		-- the walker's certification reasons for THIS page (nil when it is fully renderable).
		-- The instant path has always had this per block; without it on the page the renderer
		-- had no way to know a page's records were unsafe to paint (RTL, in practice).
		local unc = p.unc and string.format(',"unc":"%s"', p.unc) or ""
		-- the shipped vpack's glue state: gsn 1 = the page was stretched to \textheight
		-- (flushbottom), so a patch must distribute its delta over the page's vg records
		-- the way a repack would, not shift rigidly
		t[i] = string.format('{"n":%d,"w":%.4f,"h":%.4f,"ht":%.4f,"gs":%.6f,"gsn":%d,"go":%d%s}',
			i, p.w, p.h, p.ht, p.gs or 0, p.gsn or 0, p.go or 0, unc)
	end
	f:write(string.format(
		'{"count":%d,"paperW":%.4f,"paperH":%.4f,"colW":%.4f,"textW":%.4f,"footSkip":%.4f,"colSep":%.4f,"blSkip":%.4f,"parSkip":%.4f,"topSkip":%.4f,"hOffset":%.4f,"vOffset":%.4f,"srcFiles":%s%s,"pages":[%s]}',
		pageno, pw, ph, cw, tw, fsk, csep, bls, pks, tsk, hoff, voff, src_files_json(),
		body_line and string.format(',"bodyLine":%d', body_line) or "", table.concat(t, ",")))
	f:close()
	-- counter snapshots ride a sidecar (they are per-line, not per-page)
	local cf = io.open(OUT .. "counters.jsonl", "w")
	if cf then
		cf:write(table.concat(counter_log, "\n"))
		cf:close()
	end
	-- completed seams ride a sidecar too: a page's LAST seam only finishes at the next
	-- page's first firing, after that page's jsonl is already written
	local sf = io.open(OUT .. "seams.jsonl", "w")
	if sf then
		local lines = {}
		for _, s in ipairs(seam_done) do
			if s.page and s.run then
				lines[#lines + 1] = string.format('{"page":%d,"col":%d,"pen":%d,"run":%s}', s.page, s.col, s.pen, s.run)
			end
		end
		sf:write(table.concat(lines, "\n"))
		sf:close()
	end
end

function page_extract(boxnum)
	local b = tex.box[boxnum]
	if not b then return end
	pageno = pageno + 1
	-- attribute breaks to this page: the firing shipping it is its last real break, and
	-- every completed-but-unowned seam was an earlier column of it. Guarded nil-checks:
	-- a firing can ship several pages (trailing float pages) and must claim only once.
	if seam_pending and not seam_pending.page then seam_pending.page = pageno end
	for _, s in ipairs(seam_done) do
		if not s.page then s.page = pageno end
	end
	seam_cols = 0
	-- The page's DIMENSIONS come from the box and are known whether or not the walk succeeds,
	-- so record them unconditionally. Registering them only on success left a hole in `pages`
	-- at the failed index, and the next page's write_manifest then indexed that nil and threw
	-- out of the shipout hook -- one bad page destroyed the manifest for the whole document.
	local ok, records, stats = pcall(walker.lines, b.head)
	pages[pageno] = {
		w = (b.width or 0) / 65536,
		h = ((b.height or 0) + (b.depth or 0)) / 65536,
		ht = (b.height or 0) / 65536,
		gs = b.glue_set or 0,
		gsn = b.glue_sign or 0,
		go = b.glue_order or 0,
		unc = ok and stats and stats.uncertified or nil
	}
	if ok then
		local f = io.open(string.format("%spage-%03d.jsonl", OUT, pageno), "w")
		if f then f:write(table.concat(records, "\n")); f:close() end
	end
	write_manifest()
end

-- kept for compatibility with existing wrappers; the real work happens per shipout
function page_extract_finish()
	write_manifest()
end
