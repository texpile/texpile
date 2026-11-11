-- A served process goes back to a state it stood in, to serve again: its base, or a point it kept (keep.lua). The
-- state is then compared with that one, and a process that differs anywhere exits.
return function(T)
	local PREFIX = "texpiletele@"
	local UNSET_ATTR = -0x7FFFFFFF
	local FAMCMD = { "textfont", "scriptfont", "scriptscriptfont" }
	local MARKS = { "top", "first", "bottom", "splitfirst", "splitbottom" }
	-- a record carries the bottom marks alone, which is as far as a point's marks go back
	local KEPT_MARKS = { "bottom", "splitfirst", "splitbottom" }
	local CHARS = 255
	local PAGE_DIMS = { "pagetotal", "pagedepth", "pagestretch", "pagefilstretch", "pagefillstretch", "pagefilllstretch", "pageshrink" }
	local GLUE, HLIST, VLIST, RULE = node.id("glue"), node.id("hlist"), node.id("vlist"), node.id("rule")
	local get_command, get_mode = token.get_command, token.get_mode
	local R

	local function G() return token.create("global") end

	-- one-character names and active characters live outside the hash. Reading a name runs TeX, so the base reads
	-- them all before it prints anything
	local chars
	local function char_tokens()
		if chars then return chars end
		chars = {}
		for c = 0, CHARS do
			local cs = T.single_cs(utf8.char(c))
			if cs then chars[#chars + 1] = cs end
			chars[#chars + 1] = token.create(c, 13)
		end
		return chars
	end
	T.char_tokens = char_tokens

	local function sorted_keys(t, skip)
		local out = {}
		for k in pairs(t) do
			if type(k) == "string" and not (skip and skip(k)) then out[#out + 1] = k end
		end
		table.sort(out)
		return table.concat(out, ",")
	end

	-- the classes holding a mark of any of these kinds, with every kind's text
	local function marks_now(kinds)
		kinds = kinds or MARKS
		local out = {}
		for c = 0, 1023 do
			local t = {}
			for i, k in ipairs(kinds) do t[i] = tex.getmark(k, c) end
			if next(t) then out[#out + 1] = { c = c, texts = t } end
		end
		return out
	end
	T.marks_now = marks_now

	-- what the diff does not read and a run can still leave behind
	local function side_state(kinds)
		kinds = kinds or MARKS
		local parts = {}
		for _, tk in ipairs(char_tokens()) do parts[#parts + 1] = get_command(tk) .. ":" .. get_mode(tk) end
		for _, m in ipairs(marks_now(kinds)) do
			parts[#parts + 1] = "mark" .. m.c
			for i = 1, #kinds do parts[#parts + 1] = tostring(m.texts[i]) end
		end
		for id = 1, T.base_font_max do
			local p = font.getparameters(id)
			if p then
				local ks = {}
				for k, v in pairs(p) do ks[#ks + 1] = k .. "=" .. tostring(v) end
				table.sort(ks)
				parts[#parts + 1] = id .. "{" .. table.concat(ks, ",") .. "}"
			end
		end
		for _, name in ipairs(luatexbase.callbacktypes and (function()
			local n = {}
			for k in pairs(luatexbase.callbacktypes) do n[#n + 1] = k end
			table.sort(n)
			return n
		end)() or {}) do
			local d = luatexbase.callback_descriptions(name)
			if d and #d > 0 then parts[#parts + 1] = name .. "=" .. table.concat(d, ";") end
		end
		parts[#parts + 1] = sorted_keys(package.loaded)
		parts[#parts + 1] = sorted_keys(_G, function(k) return k:lower():sub(1, 7) == "texpile" end)
		parts[#parts + 1] = tostring(tex.lists.page_discards_head) .. tostring(tex.lists.split_discards_head)
		parts[#parts + 1] = tex.deadcycles .. "/" .. tex.insertpenalties
		for _, k in ipairs(PAGE_DIMS) do parts[#parts + 1] = k .. "=" .. tex[k] end
		return table.concat(parts, "|")
	end
	function T.kept_side() return side_state(KEPT_MARKS) end

	-- at the base: an alias for each character's meaning, and what the comparison later needs
	function T.base_extras(rec)
		local pins = {}
		T.char_pin = {}
		for i, tk in ipairs(char_tokens()) do
			local alias = PREFIX .. "c" .. i
			token.set_macro(alias, "", "global")
			T.char_pin[i] = alias
			T.let_global(pins, token.create(alias), tk)
		end
		tex.sprint(pins)
		T.base.chars = {}
		for i, tk in ipairs(char_tokens()) do T.base.chars[i] = { get_command(tk), get_mode(tk) } end
		T.base.char_pin = T.char_pin
		T.base.canon = T.canon(rec)
		T.base.cstacks = T.color_stacks()
		T.base.carry = T.carry_get()
		T.base.side = side_state()
	end

	local function glue_spec(v)
		local g = node.new("glue_spec")
		g.width, g.stretch, g.shrink, g.stretch_order, g.shrink_order = v[1], v[2], v[3], v[4], v[5]
		return g
	end

	local function lap(name)
		R.laps[#R.laps + 1] = string.format("%s=%.0f", name, (os.gettimeofday() - R.t0) * 1000)
	end

	-- each step prints what TeX has to run before the next one reads the state
	local steps = {}
	local function next_step()
		R.at = R.at + 1
		lap(R.seq[R.at])
		steps[R.seq[R.at]]()
	end
	function texpile_tele_reset_next() next_step() end
	local function after_tex() tex.sprint("\\directlua{texpile_tele_reset_next()}") end

	-- The base's page holds no box (a write, the color stack's start), so its values can go back after it. A kept
	-- point's page is rebuilt by the page builder, which reads them: they go back first.
	local BASE_STEPS = { "marks", "page", "values", "tail", "verify" }
	local KEPT_STEPS = { "values", "marks", "page", "settle", "tail", "verify" }

	-- the page and what waits for it go through an output routine that drops them, as the apply empties a page.
	-- `kept`: the point to go back to in place of the base
	function T.reset(done, kept)
		R = { done = done, to = kept or T.base, kept = kept, seq = kept and KEPT_STEPS or BASE_STEPS, at = 0, t0 = os.gettimeofday(), laps = {} }
		if tex.lists.contrib_head then
			local old = tex.lists.contrib_head
			tex.lists.contrib_head = nil
			node.flush_list(old)
		end
		if tex.lists.page_head then tex.sprint("\\begingroup\\output{\\setbox0\\box255 \\deadcycles0 }\\hbox{}\\penalty-10000 \\endgroup") end
		after_tex()
	end

	local function print_marks(list)
		local LB, RB = token.new(123, 1), token.new(125, 2)
		for c, toks in pairs(list or {}) do
			tex.sprint({ token.create("marks") })
			tex.sprint(c .. " ")
			local seq = { LB, token.create("unexpanded"), LB }
			for _, x in ipairs(T.built(toks)) do seq[#seq + 1] = x end
			seq[#seq + 1] = RB
			seq[#seq + 1] = RB
			tex.sprint(seq)
		end
	end

	-- every mark goes, then the ones to go back to come the way TeX sets them: bottom marks on a page an output routine
	-- drops (first and bottom, no top, as one page shipped before the base leaves them), split marks through one
	-- \vsplit, which clears every class's before it sets them
	function steps.marks()
		for _, m in ipairs(marks_now()) do tex.sprint("\\clearmarks" .. m.c .. " ") end
		local back = R.to.marks_toks
		if back.botmarks and next(back.botmarks) then
			tex.sprint("\\begingroup\\output{\\setbox0\\box255 \\deadcycles0 }\\hbox{}")
			print_marks(back.botmarks)
			tex.sprint("\\penalty-10000 \\endgroup")
		end
		if back.splitfirstmarks or back.splitbotmarks then
			tex.sprint("\\begingroup\\setbox0\\vbox{")
			print_marks(back.splitfirstmarks)
			print_marks(back.splitbotmarks)
			tex.sprint("}\\setbox0\\vsplit0 to 0pt\\endgroup")
		end
		after_tex()
	end

	-- the page's own items go through the page builder as they did then
	function steps.page()
		-- with \savingvdiscards on, the routines above leave what their breaks discarded
		for _, k in ipairs({ "page_discards_head", "split_discards_head" }) do
			if tex.lists[k] then
				local old = tex.lists[k]
				tex.lists[k] = nil
				node.flush_list(old)
			end
		end
		local copy = node.copy_list(R.to.pagecopy)
		if R.kept then
			T.reset_vsize()
			-- the page builder drops the topskip glue it made and makes its own from \topskip and the first box: for
			-- that moment \topskip is what gives the glue back
			for n in node.traverse(copy) do
				if n.id == GLUE and n.subtype == 10 then
					local bx = n.next
					while bx and not (bx.id == HLIST or bx.id == VLIST or bx.id == RULE) do bx = bx.next end
					if bx then
						R.topskip = { tex.getglue("topskip") }
						tex.setglue("topskip", n.width > 0 and n.width + bx.height or 0, n.stretch, n.shrink, n.stretch_order, n.shrink_order)
					end
					break
				end
				if n.id == HLIST or n.id == VLIST or n.id == RULE then break end
			end
			-- the goal came from \vsize when the page took its first box, whatever \vsize is now
			if R.to.vsize_start then
				R.vsize = tex.vsize
				tex.set("vsize", R.to.vsize_start)
			end
			T.rebuilding = true
		end
		if copy then
			node.write(copy)
			tex.sprint({ token.create(PREFIX .. "par") })
		end
		after_tex()
	end

	-- token lists go back through TeX, and building them can run TeX: all are built before anything is printed
	local function params_back(to, lists, fails)
		for _, pk in ipairs(T.param_list) do
			local p, k = pk[1], pk[2]
			local v, bv = T.param_value(p, k), to.params[p]
			if bv ~= nil and v ~= bv then
				if k == "t" then lists[#lists + 1] = { pre = { G(), token.create(p) }, b = T.built(to.tparam_toks[p] or {}) }
				elseif k == "s" then lists[#lists + 1] = { text = "\\global\\" .. p .. " " .. bv .. "\\relax" }
				elseif k == "m" then
					local g = T.glue_of(bv)
					tex.setmuglue(65535, g[1], g[2], g[3], g[4], g[5])
					lists[#lists + 1] = { text = "\\global\\" .. p .. "=\\muskip65535\\global\\muskip65535=0mu\\relax" }
				elseif not pcall(tex.set, "global", p, k == "g" and glue_spec(T.glue_of(bv)) or tonumber(bv)) then fails[#fails + 1] = p end
			end
		end
	end

	local function print_lists(lists)
		local LB, RB = token.new(123, 1), token.new(125, 2)
		for _, l in ipairs(lists) do
			if l.text then tex.sprint(l.text)
			else
				tex.sprint(l.pre)
				if l.text0 then tex.sprint(l.text0) end
				if l.b then
					local body = { LB }
					for _, x in ipairs(l.b) do body[#body + 1] = x end
					body[#body + 1] = RB
					tex.sprint(body)
				end
				if l.post then tex.sprint(l.post) end
			end
		end
	end

	function steps.values()
		local b = R.to
		local fails = {}
		local seq = {}
		local function let(tk, back) T.let_global(seq, tk, token.create(back)) end
		local changed = T.changed_names(true, nil, b.over)
		R.names = changed
		for _, nm in ipairs(changed) do
			local o = b.over and b.over[nm]
			local back = o and o[6] or T.base_back(nm)
			if back then let(token.create(nm), back) else fails[#fails + 1] = nm end
		end
		for i, tk in ipairs(char_tokens()) do
			local e = b.chars[i]
			if get_command(tk) ~= e[1] or get_mode(tk) ~= e[2] then let(tk, b.char_pin[i]) end
		end
		local lists = {}
		params_back(b, lists, fails)
		local bound = T.reg_bound()
		local s, br = T.regs_now(bound), b.regs
		for i = 0, bound do
			if (s.c[i]) ~= (br.c[i] or 0) then tex.setcount("global", i, br.c[i] or 0) end
			if s.d[i] ~= (br.d[i] or 0) then tex.setdimen("global", i, br.d[i] or 0) end
			if s.k[i] ~= (br.k[i] or "0,0,0,0,0") then tex.setskip("global", i, glue_spec(T.glue_of(br.k[i] or "0,0,0,0,0"))) end
			if s.m[i] ~= (br.m[i] or "0,0,0,0,0") then tex.setmuskip("global", i, glue_spec(T.glue_of(br.m[i] or "0,0,0,0,0"))) end
			if s.a[i] ~= (br.a[i] or UNSET_ATTR) then tex.setattribute("global", i, br.a[i] or UNSET_ATTR) end
			if s.t[i] ~= (br.t[i] or "") then
				lists[#lists + 1] = { pre = { G(), token.create("toks") }, text0 = i .. "=", b = T.built(b.toks_toks[i] or {}) }
			end
			local held = b.boxcopy[i]
			if held then
				if s.box[i] == 0 or T.box_dump(tex.getbox(i)) ~= b.boxdump[i] then tex.setbox("global", i, node.copy(held)) end
			elseif s.box[i] ~= 0 then tex.setbox("global", i, nil) end
		end
		local codes = T.codes_now()
		for c, v in pairs(b.codes) do
			if codes[c] ~= v then
				local f = {}
				for x in v:gmatch("[^,]+") do f[#f + 1] = x end
				local m = {}
				for x in f[5]:gmatch("[^.]+") do m[#m + 1] = tonumber(x) end
				tex.setcatcode("global", c, tonumber(f[1]))
				tex.setlccode("global", c, tonumber(f[2]))
				tex.setuccode("global", c, tonumber(f[3]))
				tex.setsfcode("global", c, tonumber(f[4]))
				T.set_mathcode(c, m)
			end
		end
		local fam = T.fams_now()
		for k, id in pairs(b.fam) do
			if fam[k] ~= id then
				local cs = PREFIX .. "rf" .. k
				if id == 0 then cs = "nullfont" else tex.definefont(true, cs, id) end
				lists[#lists + 1] = { pre = { G(), token.create(FAMCMD[k % 3 + 1]) }, text0 = (k // 3) .. "=", post = { token.create(cs) } }
			end
		end
		if #fails > 0 then
			R.done(false, "cannot put back " .. table.concat(fails, ", ", 1, math.min(#fails, 4)))
			return
		end
		tex.sprint(seq)
		print_lists(lists)
		after_tex()
	end

	-- a kept point's page is back: what its rebuild moved goes back to the point's own
	function steps.settle()
		local b = R.to
		T.rebuilding = false
		if R.vsize then tex.set("vsize", R.vsize) end
		if R.topskip then tex.setglue("topskip", table.unpack(R.topskip)) end
		-- the routines that dropped pages and the rebuild's \par wrote parameters of their own
		local lists, fails = {}, {}
		params_back(b, lists, fails)
		local ps = b.pagestate
		if tex.pagegoal ~= ps[1] or tex.pagetotal ~= ps[2] or tex.pagedepth ~= ps[3] then
			fails[#fails + 1] = string.format("page state %d/%d/%d against %d/%d/%d", tex.pagegoal, tex.pagetotal, tex.pagedepth, ps[1], ps[2], ps[3])
		end
		if #fails > 0 then
			R.done(false, "cannot put back " .. table.concat(fails, ", ", 1, math.min(#fails, 4)))
			return
		end
		print_lists(lists)
		after_tex()
	end

	function steps.tail()
		local b = R.to
		local waiting = node.copy_list(b.contribcopy)
		if waiting then node.write(waiting) end
		if font.current() ~= b.curfont then font.current(b.curfont) end
		-- Lua has no setter for these: an assignment would only hide the real values from later reads
		tex.sprint({ token.create("deadcycles") })
		tex.sprint(b.deadcycles .. "\\relax")
		-- the page builder counted a kept point's inserts again as it took them
		if not R.kept then
			tex.sprint({ token.create("insertpenalties") })
			tex.sprint(b.insertpenalties .. "\\relax")
		end
		tex.nest[0].prevdepth, tex.nest[0].prevgraf = b.prevdepth, b.prevgraf
		after_tex()
	end

	local function first_diff(x, y)
		local i = 1
		while i <= #x and x:sub(i, i) == y:sub(i, i) do i = i + 1 end
		return x:sub(math.max(1, i - 80), i + 40):gsub("%s+", " ")
	end

	-- A kept point's state is a whole record, too much to diff after every run: what the reset set is read again, value
	-- by value, with the lists by their lengths (their nodes are copies of the point's own)
	local function kept_difference(b)
		for _, nm in ipairs(R.names) do
			if T.name_changed(nm, b.over) then return "name " .. nm end
		end
		for _, pk in ipairs(T.param_list) do
			if b.params[pk[1]] ~= nil and T.param_value(pk[1], pk[2]) ~= b.params[pk[1]] then return "parameter " .. pk[1] end
		end
		local bound = T.reg_bound()
		local s, br = T.regs_now(bound), b.regs
		for i = 0, bound do
			if s.c[i] ~= (br.c[i] or 0) or s.d[i] ~= (br.d[i] or 0) or s.k[i] ~= (br.k[i] or "0,0,0,0,0") or s.m[i] ~= (br.m[i] or "0,0,0,0,0")
				or s.a[i] ~= (br.a[i] or UNSET_ATTR) or s.t[i] ~= (br.t[i] or "") or (s.box[i] ~= 0) ~= (b.boxcopy[i] ~= nil) then
				return "register " .. i
			end
		end
		local codes = T.codes_now()
		for c, v in pairs(b.codes) do
			if codes[c] ~= v then return "codes of " .. c end
		end
		local fam = T.fams_now()
		for k, id in pairs(b.fam) do
			if fam[k] ~= id then return "family " .. k end
		end
		if font.current() ~= b.curfont then return "current font" end
		if node.length(tex.lists.page_head) ~= b.pagelen or node.length(tex.lists.contrib_head) ~= b.contriblen then return "page length" end
		if tex.nest[0].prevdepth ~= b.prevdepth or tex.nest[0].prevgraf ~= b.prevgraf then return "prevdepth" end
		return nil
	end

	function steps.verify()
		local b = R.to
		T.shipped, T.fires = b.shipped, b.fires
		T.page_epoch = T.page_epoch + 1
		T.carry_set(b.carry)
		T.push_colors(b.cstacks)
		if not R.kept then T.reset_vsize() end
		-- the fonts the run selected are set up in this process for good; the ones selected up to the point count again
		T.selected = {}
		for nm in pairs(b.selected or {}) do T.selected[nm] = true end
		local differs
		if R.kept then
			local what = kept_difference(b)
			differs = what and ("state: " .. what)
		else
			local got = T.canon(T.diff())
			differs = got ~= b.canon and ("state: " .. first_diff(got, b.canon))
		end
		local side = R.kept and side_state(KEPT_MARKS) or side_state()
		lap("done")
		T.reset_laps = table.concat(R.laps, " ")
		local done = R.done
		R = nil
		if differs then return done(false, differs) end
		if side ~= b.side then return done(false, "side: " .. first_diff(side, b.side)) end
		done(true)
	end
end
