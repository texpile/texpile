-- A served process goes back to its base to serve again. The state is then compared with the base, and a process
-- that differs anywhere exits.
return function(T)
	local PREFIX = "texpiletele@"
	local MAXDIMEN = 1073741823
	local UNSET_ATTR = -0x7FFFFFFF
	local FAMCMD = { "textfont", "scriptfont", "scriptscriptfont" }
	local MARKS = { "top", "first", "bottom", "splitfirst", "splitbottom" }
	local CHARS = 255
	local PAGE_DIMS = { "pagetotal", "pagedepth", "pagestretch", "pagefilstretch", "pagefillstretch", "pagefilllstretch", "pageshrink" }
	local get_command, get_mode = token.get_command, token.get_mode
	local R

	local function G() return token.create("global") end
	local L = token.create("let")

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

	-- the classes holding a mark of any kind, with every kind's text
	local function marks_now()
		local out = {}
		for c = 0, 1023 do
			local t = {}
			for i, k in ipairs(MARKS) do t[i] = tex.getmark(k, c) end
			if next(t) then out[#out + 1] = { c = c, texts = t } end
		end
		return out
	end
	T.marks_now = marks_now

	-- what the diff does not read and a run can still leave behind
	local function side_state()
		local parts = {}
		for _, tk in ipairs(char_tokens()) do parts[#parts + 1] = get_command(tk) .. ":" .. get_mode(tk) end
		for _, m in ipairs(marks_now()) do
			parts[#parts + 1] = "mark" .. m.c
			for i = 1, #MARKS do parts[#parts + 1] = tostring(m.texts[i]) end
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

	-- at the base: an alias for each character's meaning, and what the comparison later needs
	function T.base_extras(rec)
		local pins = {}
		T.char_pin = {}
		for i, tk in ipairs(char_tokens()) do
			local alias = PREFIX .. "c" .. i
			token.set_macro(alias, "", "global")
			T.char_pin[i] = alias
			pins[#pins + 1] = G()
			pins[#pins + 1] = L
			pins[#pins + 1] = token.create(alias)
			pins[#pins + 1] = tk
		end
		tex.sprint(pins)
		T.base.chars = {}
		for i, tk in ipairs(char_tokens()) do T.base.chars[i] = { get_command(tk), get_mode(tk) } end
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

	-- the page and what waits for it go through an output routine that drops them, as the apply empties a page
	function T.reset(done)
		R = { done = done }
		if tex.lists.contrib_head then
			local old = tex.lists.contrib_head
			tex.lists.contrib_head = nil
			node.flush_list(old)
		end
		if tex.lists.page_head then tex.sprint("\\begingroup\\output{\\setbox0\\box255 \\deadcycles0 }\\hbox{}\\penalty-10000 \\endgroup") end
		tex.sprint("\\directlua{texpile_tele_reset1a()}")
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

	-- every mark goes, then the base's come back the way TeX sets them: bottom marks on a page an output routine
	-- drops (first and bottom, no top, as one page shipped before the base leaves them), split marks through one
	-- \vsplit, which clears every class's before it sets them
	function texpile_tele_reset1a()
		for _, m in ipairs(marks_now()) do tex.sprint("\\clearmarks" .. m.c .. " ") end
		local back = T.base.marks_toks
		if back.botmarks then
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
		tex.sprint("\\directlua{texpile_tele_reset1b()}")
	end

	-- the base's own page items (a write, the color stack's start) go through the page builder as they did then
	function texpile_tele_reset1b()
		-- with \savingvdiscards on, the routines above leave what their breaks discarded
		for _, k in ipairs({ "page_discards_head", "split_discards_head" }) do
			if tex.lists[k] then
				local old = tex.lists[k]
				tex.lists[k] = nil
				node.flush_list(old)
			end
		end
		local copy = node.copy_list(T.base.pagecopy)
		if copy then
			node.write(copy)
			tex.sprint({ token.create(PREFIX .. "par") })
		end
		tex.sprint("\\directlua{texpile_tele_reset2()}")
	end

	function texpile_tele_reset2()
		local b = T.base
		local fails = {}
		local seq = {}
		local function let(tk, back)
			seq[#seq + 1] = G()
			seq[#seq + 1] = L
			seq[#seq + 1] = tk
			seq[#seq + 1] = token.create(back)
		end
		for _, nm in ipairs(T.changed_names(true)) do
			local back = T.base_back(nm)
			if back then let(token.create(nm), back) else fails[#fails + 1] = nm end
		end
		for i, tk in ipairs(char_tokens()) do
			local e = b.chars[i]
			if get_command(tk) ~= e[1] or get_mode(tk) ~= e[2] then let(tk, T.char_pin[i]) end
		end
		-- token lists go back through TeX, and building them can run TeX: all are built before anything is printed
		local lists = {}
		for _, pk in ipairs(T.param_list) do
			local p, k = pk[1], pk[2]
			local v, bv = T.param_value(p, k), b.params[p]
			if bv ~= nil and v ~= bv then
				if k == "t" then lists[#lists + 1] = { pre = { G(), token.create(p) }, b = T.built(b.tparam_toks[p] or {}) }
				elseif k == "m" then
					local g = T.glue_of(bv)
					tex.setmuglue(65535, g[1], g[2], g[3], g[4], g[5])
					lists[#lists + 1] = { text = "\\global\\" .. p .. "=\\muskip65535\\global\\muskip65535=0mu\\relax" }
				elseif not pcall(tex.set, "global", p, k == "g" and glue_spec(T.glue_of(bv)) or tonumber(bv)) then fails[#fails + 1] = p end
			end
		end
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
				tex.setmathcode("global", c, #m == 1 and m[1] or m)
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
		local waiting = node.copy_list(b.contribcopy)
		if waiting then node.write(waiting) end
		if font.current() ~= b.curfont then font.current(b.curfont) end
		-- Lua has no setter for these: an assignment would only hide the real values from later reads
		tex.sprint({ token.create("deadcycles") })
		tex.sprint(b.deadcycles .. "\\relax")
		tex.sprint({ token.create("insertpenalties") })
		tex.sprint(b.insertpenalties .. "\\relax")
		tex.nest[0].prevdepth, tex.nest[0].prevgraf = b.prevdepth, b.prevgraf
		tex.sprint("\\directlua{texpile_tele_reset3()}")
	end

	function texpile_tele_reset3()
		local b = T.base
		T.shipped, T.fires = b.shipped, b.fires
		T.page_epoch = T.page_epoch + 1
		T.carry_set(b.carry)
		T.push_colors(b.cstacks)
		T.reset_vsize()
		local function first_diff(x, y)
			local i = 1
			while i <= #x and x:sub(i, i) == y:sub(i, i) do i = i + 1 end
			return x:sub(math.max(1, i - 80), i + 40):gsub("%s+", " ")
		end
		local got = T.canon(T.diff())
		local done = R.done
		R = nil
		if got ~= b.canon then return done(false, "state: " .. first_diff(got, b.canon)) end
		local side = side_state()
		if side ~= b.side then return done(false, "side: " .. first_diff(side, b.side)) end
		done(true)
	end
end
