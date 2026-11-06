-- Teleport: record what differs from the state at the first body line (the base) at clean points, and put a
-- record back into a fresh process waiting at its base. Loaded by the job prefix after page-extract.lua.
-- Globals: TEXPILE_ENGINE_DIR, TEXPILE_TELE_OUT (relative folder for records), TEXPILE_TELE_WAIT (hold at the base
-- for GO or TELE <plan> on stdin).
local DIR = TEXPILE_ENGINE_DIR .. "/teleport"
local OUT = (TEXPILE_TELE_OUT or "_draft/tele") .. "/"
local PREFIX = "texpiletele@"
local MAXDIMEN = 1073741823
-- recording stops costing more than this share of the body's time: points then skip pages
local RECORD_SHARE = TEXPILE_TELE_SHARE or 0.25

local T = { shipped = 0, fires = 0, page_epoch = 0, overrides = {}, entries = {}, fontmap = {}, fontrefs = {}, unsupported = {}, setfail = {}, seq = 0 }
TEXPILE_TELE_CARRY = TEXPILE_TELE_CARRY or {}
lfs.mkdir(OUT:sub(1, -2))
T.snapshot_dir = OUT .. "src/"
lfs.mkdir(OUT .. "src")

local function say(s)
	io.write("\n@@TELE ", s, "\n")
	io.flush()
end

dofile(DIR .. "/serial.lua")(T)
dofile(DIR .. "/scan.lua")(T)
dofile(DIR .. "/apply.lua")(T)
dofile(DIR .. "/reader.lua")(T)

token.set_macro(PREFIX .. "undef", "", "global")
tex.sprint({ token.create("global"), token.create("let"), token.create(PREFIX .. "undef"), token.create(PREFIX .. "never") })
-- the page builder runs at TeX's own \par: a document's \par can be a macro (LaTeX after an environment)
token.set_macro(PREFIX .. "par", "", "global")
tex.sprint({ token.create("global"), token.create("let"), token.create(PREFIX .. "par"), token.create("par") })

-- the output routine can run without shipping (a two-column left column): each run empties the page and moves the marks
luatexbase.add_to_callback("pre_output_filter", function()
	T.fires = T.fires + 1
	T.page_epoch = T.page_epoch + 1
	if T.rebuilding then T.refuse("the output routine ran while the page was rebuilt") end
	return true
end, "texpile.tele.fires")

-- \vsize when the current page took its first box: the goal comes from it then
local vsize_candidate, vsize_start
luatexbase.add_to_callback("buildpage_filter", function()
	if tex.pagegoal == MAXDIMEN then vsize_candidate, vsize_start = tex.vsize, nil
	elseif not vsize_start then vsize_start = vsize_candidate end
end, "texpile.tele.vsize")
function T.vsize_start() return vsize_start or vsize_candidate end

-- the PDF color stacks between pages, followed through every shipped page
local stacks = {}
local WHATSIT = node.id("whatsit")
local COLORSTACK = node.subtype("pdf_colorstack")
local SKIP_ATTR = luatexbase.new_attribute("texpiletelecolor")
TEXPILE_TELE_SKIP_ATTR = SKIP_ATTR
local function follow_colors(head)
	for n in node.traverse(head) do
		if n.id == WHATSIT and n.subtype == COLORSTACK and not node.has_attribute(n, SKIP_ATTR) then
			local st = stacks[n.stack] or { items = {} }
			stacks[n.stack] = st
			if n.command == 1 then st.items[#st.items + 1] = n.data
			elseif n.command == 2 then st.items[#st.items] = nil
			elseif n.command == 0 then
				if #st.items > 0 then st.items[#st.items] = n.data else st.bottom = n.data end
			end
		elseif n.head then follow_colors(n.head) end
	end
end
function T.color_stacks()
	local out = {}
	local ids = {}
	for id in pairs(stacks) do ids[#ids + 1] = id end
	table.sort(ids)
	for _, id in ipairs(ids) do
		local items = {}
		for i, d in ipairs(stacks[id].items) do items[i] = d end
		if stacks[id].bottom or #items > 0 then out[#out + 1] = { id = id, bottom = stacks[id].bottom, items = items } end
	end
	return out
end
-- LuaTeX sets the carried color where a page starts, ahead of its header: the pushes go at the head of the next
-- shipped page box
local pending_colors
function T.push_colors(list)
	local pre, tail
	for _, st in ipairs(list or {}) do
		local function add(cmd, data)
			local w = node.new(WHATSIT, COLORSTACK)
			w.stack, w.command, w.data = st.id, cmd, data
			if tail then
				tail.next = w
				w.prev = tail
			else pre = w end
			tail = w
		end
		if st.bottom then add(0, st.bottom) end
		for _, d in ipairs(st.items) do add(1, d) end
	end
	if pending_colors then node.flush_list(pending_colors) end
	pending_colors = pre
	stacks = {}
	for _, st in ipairs(list or {}) do
		local items = {}
		for i, d in ipairs(st.items) do items[i] = d end
		stacks[st.id] = { bottom = st.bottom, items = items }
	end
end

-- page-extract calls these around writing each page's records: before, for the color stack the page began with
function TEXPILE_TELE_PREPAGE(box)
	if pending_colors and box then
		for w in node.traverse(pending_colors) do node.set_attribute(w, SKIP_ATTR, 1) end
		local t = node.tail(pending_colors)
		t.next = box.list
		if box.list then box.list.prev = t end
		box.list = pending_colors
		pending_colors = nil
		return {}
	end
	local seed = {}
	for i, d in ipairs(stacks[0] and stacks[0].items or {}) do seed[i] = d end
	return seed
end
function TEXPILE_TELE_PAGE(box, n, meta)
	if box then follow_colors(box.head) end
	T.shipped = n
	T.want_point = true
	if T.serving and n >= T.report_from then say(string.format("PAGE %d %.4f %.4f%s", n, meta.w, meta.h, meta.unc and (" " .. meta.unc) or "")) end
	if T.stop_after_page then
		say("STOP " .. n .. " " .. T.stop_after_page)
		os.exit(0)
	end
end

-- a record's file table holds the files seen up to its point; the plan's names them all, in the same order
function T.adopt_files()
	local c = TEXPILE_TELE_CARRY.pageextract
	if not c or not T.files then return end
	local v = c.get()
	if #T.files > #v.files then
		v.files = T.files
		c.set(v)
	end
end

-- Lua state other scripts keep (page-extract's page count and file table) rides along in the record
function T.carry_get()
	local out = {}
	for k, c in pairs(TEXPILE_TELE_CARRY) do out[k] = c.get() end
	return out
end
function T.carry_set(v)
	for k, c in pairs(TEXPILE_TELE_CARRY) do
		if v and v[k] ~= nil then c.set(v[k]) end
	end
end

function T.refuse(why)
	say("REFUSED " .. why)
	os.exit(3)
end

-- TeX goes on after a Lua error: until the plan is in, that would typeset the body from the base as a compile
luatexbase.add_to_callback("show_lua_error_hook", function()
	if T.applying then T.refuse("lua: " .. tostring(status.lastluaerrorstring)) end
end, "texpile.tele.luaerror")

-- the base: every record is the difference from this moment
function texpile_tele_begin_end() T.want_base = true end

local index_file
local base_clock, record_ms = 0, 0
T.prof = TEXPILE_TELE_PROF and {} or nil
if T.prof then
	luatexbase.add_to_callback("stop_run", function()
		local keys = {}
		for k in pairs(T.prof) do keys[#keys + 1] = k end
		table.sort(keys)
		local parts = {}
		for _, k in ipairs(keys) do parts[#parts + 1] = string.format("%s=%.0f", k, T.prof[k]) end
		texio.write_nl("term and log", "@@TELE PROF " .. table.concat(parts, " ") .. string.format(" record=%.0f body=%.0f", record_ms, (os.gettimeofday() - base_clock) * 1000))
	end, "texpile.tele.prof")
end
function texpile_tele_base()
	T.take_base()
	T.base_font_max = font.max()
	T.at_base = true
	T.want_point = TEXPILE_TELE_DENSE or false
	base_clock = os.gettimeofday()
	lfs.mkdir(OUT:sub(1, -2))
	if not TEXPILE_TELE_WAIT then
		index_file = io.open(OUT .. "index.jsonl", "w")
		return
	end
	-- the files still open at the base (the main file) carry the body: their preamble is compared as text
	local open = {}
	for _, r in ipairs(T.stack) do if r.rel then open[r.rel] = true end end
	local pre = {}
	for _, f in ipairs(T.pre_files) do
		if not open[f] then pre[#pre + 1] = string.format("%q", f):gsub("\\\n", "\\n") end
	end
	say("READY [" .. table.concat(pre, ",") .. "]")
	T.applying = true
	texpile_tele_next()
end

-- the fonts the recording loaded after its base, which a teleport would otherwise load after the edit
local function write_fonts()
	local f = io.open(OUT .. "fonts.lua", "w")
	if not f then return end
	local list = {}
	for id = T.base_font_max + 1, font.max() do
		-- a size TeX cannot be given back in sp (a scaled fallback font) is left to load when used
		local name, size = (T.fontkey(id) or ""):match("^(.*)@(%d+)$")
		if name then list[#list + 1] = { name, size } end
	end
	f:write("return ", T.dump(list), "\n")
	f:close()
end

-- at the base: GO compiles on, TELE <plan> teleports, FONTS <list> loads fonts and waits again
function texpile_tele_next()
	local l = io.stdin:read("*l")
	if l then l = l:gsub("\r$", "") end
	if l == "GO" then
		T.applying = false
		index_file = io.open(OUT .. "index.jsonl", "w")
		luatexbase.add_to_callback("stop_run", write_fonts, "texpile.tele.fonts")
		return
	end
	local fonts = l and l:match("^FONTS (.+)$")
	if fonts then
		local have = {}
		for id = 1, font.max() do
			local key = T.fontkey(id)
			if key then have[key] = true end
		end
		for i, spec in ipairs(T.read_record(fonts) or {}) do
			if not have[spec[1] .. "@" .. spec[2]] then
				token.set_macro(PREFIX .. "pre" .. i, "", "global")
				tex.sprint({ token.create("global"), token.create("font"), token.create(PREFIX .. "pre" .. i) })
				tex.sprint(-2, '"' .. spec[1] .. '"')
				tex.sprint(" at " .. spec[2] .. "sp\\relax")
			end
		end
		tex.sprint("\\directlua{texpile_tele_next()}")
		return
	end
	local plan = l and l:match("^TELE (.+)$")
	if not plan then os.exit(101) end
	T.serve(dofile(plan))
end

-- a clean point: the main vertical list, nothing open since the base, and this line not yet read
local function clean(line)
	return tex.nest.ptr == 0 and tex.currentgrouplevel == T.base.level and tex.currentiflevel == T.base.iflevel
		and T.reading and T.reading.pos == line - 1 and T.stack[#T.stack] == T.reading
end

-- comparison ignores what only labels the source: line stamps shift with every line an edit adds
local function canon(rec)
	local ign = {}
	for _, a in ipairs(TEXPILE_TELE_IGNORE_ATTRS or {}) do ign[a] = true end
	local function strip(lst)
		local out = {}
		for i, o in ipairs(lst or {}) do
			local c = {}
			for k, v in pairs(o) do
				if k == "attr" then
					local a = {}
					for _, x in ipairs(v) do if not ign[x[1]] then a[#a + 1] = x end end
					c.attr = a
				elseif type(v) == "table" and v.list then c[k] = { list = strip(v.list) }
				else c[k] = v end
			end
			out[i] = c
		end
		return out
	end
	local c = {}
	for k, v in pairs(rec) do c[k] = v end
	c.page, c.contrib = strip(rec.page), strip(rec.contrib)
	local boxes = {}
	for i, b in ipairs(rec.boxes) do boxes[i] = { i = b.i, list = strip(b.list) } end
	c.boxes = boxes
	local regs = {}
	for _, g in ipairs(rec.regs) do if not (g.k == "a" and ign[g.i]) then regs[#regs + 1] = g end end
	c.regs = regs
	-- object numbers: a teleported process allocates a font's objects the first time it ships it, later than the recording
	return T.dump(c, { stack = true, carry = true, id = true, maxobj = true, q = true })
end

-- a body file opened after this point: an edit in it is read from here on, whether or not a point lands inside
function T.entered(rel)
	-- past a matched stop the index already holds what follows
	if index_file and not T.stop_after_page then
		index_file:write(string.format('{"enter":%q,"after":%d}\n', rel, T.seq))
		index_file:flush()
	end
end

-- what tells two points' states apart without a diff: where the page stands and how long its lists are
local function quick_state()
	return { T.shipped, T.fires, tex.pagegoal, tex.pagetotal, tex.pagedepth, node.length(tex.lists.page_head),
		node.length(tex.lists.contrib_head), tex.nest[0].prevgraf }
end

local function write_point(rec, opening)
	T.seq = T.seq + 1
	local file = string.format("%sr-%05d.lua", OUT, T.seq)
	rec.id = T.seq
	if not T.write_record(file, rec) then return end
	if index_file then
		local st = {}
		for i, e in ipairs(rec.stack) do st[i] = string.format("[%q,%d]", e.f, e.l):gsub("\\\n", "\\n") end
		index_file:write(string.format('{"id":%d,"file":%q,"stack":[%s],"shipped":%d,"fires":%d,"open":%s,"q":[%s]%s}\n', T.seq, file,
			table.concat(st, ","), rec.shipped, rec.fires, opening and "true" or "false", table.concat(rec.q, ","),
			rec.refuse and ',"refuse":true' or ""))
		index_file:flush()
	end
end

function texpile_tele_opened()
	local r = T.stack[#T.stack]
	if r and r.source then r.open_keys = T.keys_of(T.diff()) end
end

-- The probe the reader puts before a line is expandable, so it can run inside a scan still reading ahead from the
-- line before (glue looking for `minus`). It only leaves an unexpandable call there: the scan stops at it, finishes
-- its assignment, and the call records once TeX executes it.
local probe_args
local PROBE_ID = luatexbase.new_luafunction("texpiletelepoint")
lua.get_functions_table()[PROBE_ID] = function()
	local a = probe_args
	probe_args = nil
	if a then T.point(a[1], a[2]) end
end
token.set_lua("texpiletelepoint", PROBE_ID, "global", "protected")
function texpile_tele_point(line, opening)
	if not T.base or not clean(line) then return end
	probe_args = { line, opening }
	tex.sprint({ token.create("texpiletelepoint") })
end

function T.point(line, opening)
	if T.stop_after_page or not clean(line) then return end
	local st = T.stack_now(line)
	if not st then return end
	local key = T.key_of(st)
	local stop = T.stops and T.stops[key]
	-- a stop whose page stands elsewhere cannot match: no diff for it
	if stop and stop.q and table.concat(stop.q, ",") ~= table.concat(quick_state(), ",") then stop = nil end
	-- the edited paragraph's first line: the next edit there starts from this point
	local staged = T.stage and st[#st].f == T.stage.f and line == T.stage.l
	-- until the edit's first page is out, a teleport only looks for its stop and records what later edits enter
	-- through: the line that opens a file, and the edited paragraph's first line
	if not stop and not staged and not opening and T.serving and T.shipped < T.report_from then return end
	if not stop and not opening and not staged then
		-- spacing: a point after a page only while recording stays under its share of the body's time
		local body_ms = (os.gettimeofday() - base_clock) * 1000
		if record_ms > RECORD_SHARE * body_ms and T.shipped > 0 then
			T.want_point = TEXPILE_TELE_DENSE or false
			return
		end
	end
	T.want_point = TEXPILE_TELE_DENSE or false
	local t0 = os.gettimeofday()
	local rec, grabs = T.diff(T.reading.open_keys)
	rec.stack = st
	rec.q = quick_state()
	local tc = os.gettimeofday()
	if T.prof then T.prof.diff = (T.prof.diff or 0) + (tc - t0) * 1000 end
	T.capture(grabs, function()
		if T.prof then
			T.prof.capture = (T.prof.capture or 0) + (os.gettimeofday() - tc) * 1000
			T.prof.points = (T.prof.points or 0) + 1
		end
		record_ms = record_ms + (os.gettimeofday() - t0) * 1000
		if stop then
			local old = T.read_record(stop.rec)
			if old and canon(old) == canon(rec) then
				-- the page under way holds lines the edit moved, and the old page has their old numbers: it ships first
				if tex.lists.page_head or tex.lists.contrib_head then
					-- this state with the new line numbers takes the old point's place
					write_point(rec, opening)
					T.stop_after_page = stop.rec
					return
				end
				say("STOP " .. T.shipped .. " " .. stop.rec)
				os.exit(0)
			end
			if old and T.selfcheck and not T.stop_dumped then
				T.stop_dumped = true
				local f = io.open(OUT .. "stop-ref.lua", "w"); f:write(canon(old)); f:close()
				f = io.open(OUT .. "stop-got.lua", "w"); f:write(canon(rec)); f:close()
			end
		end
		write_point(rec, opening)
	end)
end

-- serving: apply the plan's chain of records, outer file to inner, then typeset on from the edit
function T.serve(plan)
	T.serving = true
	TEXPILE_TELE_SERVING = true
	for rel, path in pairs(plan.overrides or {}) do
		T.overrides[rel] = path
		T.reload(rel)
	end
	-- the old points after the edit, at their new lines: where the run may find it already matches
	local stops = {}
	local e = plan.edit
	for _, s in ipairs(plan.stops or {}) do
		local ok, st = true, {}
		for i, x in ipairs(s.stack) do
			local l = x.l
			if e and x.f == e.f then
				if l > e.oldTo then l = l + e.newTo - e.oldTo
				elseif l >= e.from then ok = false end
			end
			st[i] = { f = x.f, l = l }
		end
		if ok then stops[T.key_of(st)] = s end
	end
	T.stops = stops
	T.selfcheck = plan.selfcheck
	T.stage = plan.stage
	index_file = io.open(OUT .. "index.jsonl", "w")
	T.chain = {}
	for k, c in ipairs(plan.chain) do
		local rec = T.read_record(c.rec)
		if not rec then T.refuse("unreadable record " .. c.rec) end
		if rec.refuse then T.refuse(rec.refuse) end
		T.chain[k] = { rec = rec, stack = c.stack, moves = c.moves }
	end
	T.files = plan.files
	-- no point before the edit: the run goes on from the base it waits at
	if #T.chain == 0 then
		T.report_from = T.shipped + 1
		T.adopt_files()
		T.applying = false
		say("APPLIED 0")
		return
	end
	T.report_from = T.chain[#T.chain].rec.shipped + 1
	texpile_tele_enter(1)
end

-- record k of the chain goes in; the reader then continues at its line, and the next file of the chain is entered
-- at the next record's line when the line that opens it runs
function texpile_tele_enter(k)
	local c = T.chain[k]
	-- what differed when the file opened is within what this record lists
	if k > 1 then T.stack[#T.stack].open_keys = T.keys_of(c.rec) end
	T.apply(c.rec, function(fails, ms)
		if #fails > 0 then T.refuse(table.concat(fails, "; ")) end
		local here = c.stack[#c.stack]
		-- the line the run enters at is the record's own point: no second one there
		if k == 1 then
			T.reading.jump = here.l
			T.reading.injected[here.l] = true
		end
		local nxt = T.chain[k + 1]
		if nxt then T.entries[nxt.stack[#nxt.stack].f] = { line = nxt.stack[#nxt.stack].l, k = k + 1 }
		else
			T.adopt_files()
			T.applying = false
			say(string.format("APPLIED %.1f %s", ms, table.concat(T.apply_stages or {}, " ")))
			if T.selfcheck then
				local rec, grabs = T.diff(T.reading.open_keys)
				T.capture(grabs, function()
					local a, b = canon(c.rec), canon(rec)
					if a ~= b then
						local f = io.open(OUT .. "self-ref.lua", "w"); f:write(a); f:close()
						f = io.open(OUT .. "self-got.lua", "w"); f:write(b); f:close()
					end
					local i = 1
					while i <= #a and a:sub(i, i) == b:sub(i, i) do i = i + 1 end
					say(a == b and "SELF same" or ("SELF differs at " .. i .. ": " .. a:sub(math.max(1, i - 200), i + 100):gsub("\n", " ") .. " | " .. b:sub(math.max(1, i - 200), i + 100):gsub("\n", " ")))
				end)
			end
		end
	end, c.moves)
end

return T
