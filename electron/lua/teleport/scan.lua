-- What differs from the base: names, macros with their exact tokens, parameters, registers, codes, fonts,
-- boxes, the page, marks and color stacks.
return function(T)
	local MAXDIMEN = 1073741823
	local REGS = 65535
	local CODES = 1023
	local PREFIX = "texpiletele@"

	local PARAM_CMDS = { assign_int = "i", assign_dimen = "d", assign_glue = "g", assign_mu_glue = "m", assign_toks = "t" }
	local params = {}
	for _, p in ipairs(tex.primitives()) do
		local tk = token.create(p)
		if tk and PARAM_CMDS[tk.cmdname] and tk.csname == p then params[#params + 1] = { p, PARAM_CMDS[tk.cmdname] } end
	end
	table.sort(params, function(a, b) return a[1] < b[1] end)
	local function param_value(p, k)
		if k == "g" or k == "m" then
			local ok, w, st, sh, sto, sho = pcall(k == "m" and tex.getmuglue or tex.getglue, p)
			if not ok then return nil end
			return table.concat({ w or 0, st or 0, sh or 0, sto or 0, sho or 0 }, ",")
		end
		if k == "t" then
			local ok, v = pcall(tex.gettoks, p)
			return ok and v or nil
		end
		local ok, v = pcall(tex.get, p)
		return ok and tostring(v) or nil
	end
	local function glue_of(s)
		local v = {}
		for x in s:gmatch("[^,]+") do v[#v + 1] = tonumber(x) end
		return v
	end

	function T.meaning_hash(name) return md5.sumhexa(token.get_meaning(name) or "") end

	-- token objects read eqtb live, so the hash is walked again only when it grew
	local name_cache, name_count, name_seen = {}, -1, {}
	local function refresh_names()
		if status.cs_count == name_count then return end
		for k, v in pairs(tex.hashtokens()) do
			local nm = type(k) == "string" and k or v
			if not name_seen[nm] then
				name_seen[nm] = true
				if type(nm) == "string" and #nm > 1 and nm:sub(1, #PREFIX) ~= PREFIX then
					local tk = token.create(nm)
					if tk and tk.csname == nm then name_cache[#name_cache + 1] = { nm, tk } end
				end
			end
		end
		name_count = status.cs_count
	end
	local CALLS = { call = true, long_call = true, outer_call = true, long_outer_call = true }
	local get_command, get_mode = token.get_command, token.get_mode
	-- e = { name, token, base command, base mode, base meaning hash (macros) }
	-- a macro defined again with the same text has a new pointer and is still the base's macro
	local function changed_names()
		refresh_names()
		local out = {}
		for _, e in ipairs(name_cache) do
			local tk = e[2]
			local cmd = get_command(tk)
			if cmd ~= e[3] or get_mode(tk) ~= e[4] then
				-- a name made after the base and still undefined behaves as no name at all
				local fresh_undefined = e[3] == nil and tk.cmdname == "undefined_cs"
				if not fresh_undefined and not (e[5] and cmd == e[3] and T.meaning_hash(e[1]) == e[5]) then
					out[#out + 1] = e[1]
				end
			end
		end
		table.sort(out)
		return out
	end

	local function reg_bound()
		-- registers past the allocators' counters are never handed out
		local b = 255
		for i = 10, 15 do b = math.max(b, tex.count[i]) end
		return math.min(REGS, b + 16)
	end

	local function regs_now(bound)
		local s = { c = {}, d = {}, k = {}, m = {}, a = {}, t = {}, box = {} }
		for i = 0, bound do
			s.c[i], s.d[i] = tex.count[i], tex.dimen[i]
			local w, st, sh, sto, sho = tex.getglue(i)
			s.k[i] = table.concat({ w, st, sh, sto, sho }, ",")
			local mw, mst, msh, msto, msho = tex.getmuglue(i)
			s.m[i] = table.concat({ mw, mst, msh, msto, msho }, ",")
			s.a[i] = tex.getattribute(i)
			s.t[i] = tex.gettoks(i)
			local b = tex.getbox(i)
			s.box[i] = b and node.direct.todirect(b) or 0
		end
		return s
	end

	local function fams_now()
		local f = {}
		for fam = 0, 255 do
			for st = 0, 2 do
				local ok, id = pcall(tex.getfontoffamily, fam, st)
				f[fam * 3 + st] = ok and id or 0
			end
		end
		return f
	end

	local function codes_now()
		local s = {}
		for c = 0, CODES do
			local mc = tex.getmathcode(c)
			if type(mc) == "table" then mc = table.concat(mc, ".") end
			s[c] = table.concat({ tex.getcatcode(c), tex.getlccode(c), tex.getuccode(c), tex.getsfcode(c), mc }, ",")
		end
		return s
	end

	-- a \countdef'd name means its register's place in eqtb: the kernel's \count@ (255) and friends give the bases
	local REG_DEF = { assign_int = "countdef", assign_dimen = "dimendef", assign_glue = "skipdef", assign_toks = "toksdef" }
	local REG_BASE = {
		assign_int = token.create("count@").mode - 255,
		assign_dimen = token.create("dimen@").mode,
		assign_glue = token.create("skip@").mode,
		assign_toks = token.create("toks@").mode,
	}
	local RELAX = token.create("relax")
	local IFTRUE, IFFALSE = token.create("iftrue"), token.create("iffalse")
	local CHARCMD = { letter = true, other_char = true, spacer = true, left_brace = true, right_brace = true, math_shift = true,
		sub_mark = true, sup_mark = true, tab_mark = true }

	-- a box's own dimensions change in place, and a box set again can land at its old address: boxes the base
	-- holds are compared by content
	local function box_dump(bx)
		local saved_f, saved_u = T.fontrefs, T.unsupported
		T.fontrefs, T.unsupported = {}, {}
		local d = T.dump(T.ser_list(bx))
		T.fontrefs, T.unsupported = saved_f, saved_u
		return d
	end

	function T.take_base()
		refresh_names()
		-- a token list freed by a redefinition can come back at the same address for a later one, which would read
		-- as the base's: an alias holds every base macro, so its address stays taken
		local G, L = token.create("global"), token.create("let")
		local pins = {}
		for _, e in ipairs(name_cache) do
			e[3], e[4] = get_command(e[2]), get_mode(e[2])
			e[5] = CALLS[e[2].cmdname] and T.meaning_hash(e[1]) or nil
			if e[5] then
				local alias = PREFIX .. "b" .. (#pins // 4 + 1)
				token.set_macro(alias, "", "global")
				pins[#pins + 1] = G
				pins[#pins + 1] = L
				pins[#pins + 1] = token.create(alias)
				pins[#pins + 1] = e[2]
			end
		end
		tex.sprint(pins)
		local b = { params = {}, level = tex.currentgrouplevel, iflevel = tex.currentiflevel }
		for _, pk in ipairs(params) do b.params[pk[1]] = param_value(pk[1], pk[2]) end
		b.regs = regs_now(math.min(REGS, reg_bound() + 256))
		b.boxdump = {}
		for i, p in pairs(b.regs.box) do
			if p ~= 0 then b.boxdump[i] = box_dump(tex.getbox(i)) end
		end
		b.fam = fams_now()
		b.codes = codes_now()
		b.shipped, b.fires = T.shipped, T.fires
		b.pagelen = node.length(tex.lists.page_head)
		b.contriblen = node.length(tex.lists.contrib_head)
		T.base = b
	end

	-- a parameter text read back from its meaning: a space as 10 and anything else 12; letters are refused
	local name_set
	local function hash_has(nm)
		if not name_set or name_set.count ~= status.cs_count then
			name_set = { count = status.cs_count, s = {} }
			for k, v in pairs(tex.hashtokens()) do
				local n = type(k) == "string" and k or v
				if type(n) == "string" then name_set.s[n] = true end
			end
		end
		return name_set.s[nm]
	end
	local function param_items(ptxt)
		local items, i = {}, 1
		while i <= #ptxt do
			local c = ptxt:sub(i, i)
			if c == "#" then
				local d = ptxt:sub(i + 1, i + 1)
				if not d:match("%d") then return nil end
				items[#items + 1] = { -1, tonumber(d) }
				i = i + 2
			elseif c == "\\" then
				local rest = ptxt:sub(i + 1)
				local sp = rest:find(" ", 1, true)
				local word = sp and rest:sub(1, sp - 1) or rest
				if sp and utf8.len(word) and utf8.len(word) > 1 and hash_has(word) then
					items[#items + 1] = word
					i = i + 1 + #word + 1
				else
					local ch = rest:match("^[%z\1-\127\194-\244][\128-\191]*")
					if not ch then return nil end
					items[#items + 1] = { 1, ch }
					i = i + 1 + #ch
					if ch:match("^%a$") and rest:sub(#ch + 1, #ch + 1) == " " then i = i + 1 end
				end
			else
				local ch = ptxt:match("^[%z\1-\127\194-\244][\128-\191]*", i)
				-- a meaning shows no catcodes: a letter here is 11 when written and 12 out of \tl_to_str
				if ch:match("^%a$") then return nil, true end
				items[#items + 1] = { ch == " " and 10 or 12, utf8.codepoint(ch) }
				i = i + #ch
			end
		end
		return items
	end

	-- what a record changes, by kind and name
	function T.keys_of(rec)
		local k = { names = {}, params = {}, regs = {}, codes = {}, fams = {} }
		for _, n in ipairs(rec.names) do k.names[n.n] = true end
		for _, m in ipairs(rec.macros) do k.names[m.n] = true end
		for _, n in ipairs(rec.nfss) do k.names[n] = true end
		for _, p in ipairs(rec.params) do k.params[p.p] = true end
		for _, p in ipairs(rec.tparams) do k.params[p.n] = true end
		for _, g in ipairs(rec.regs) do k.regs[(g.k == "bvoid" or g.k == "bempty") and ("b" .. g.i) or (g.k .. g.i)] = true end
		for _, g in ipairs(rec.toks) do k.regs["t" .. g.r] = true end
		for _, b in ipairs(rec.boxes) do k.regs["b" .. b.i] = true end
		for _, c in ipairs(rec.codes) do k.codes[c.c] = true end
		for _, f in ipairs(rec.fams) do k.fams[f.k] = true end
		return k
	end

	-- the state's difference from the base, as a record still missing the tokens TeX has to hand over. `keep` (from
	-- keys_of) names what goes in at its current value even where that equals the base
	-- macro bodies already captured, by name, with the meaning they had
	local captured = {}
	local clock = os.gettimeofday
	local function lap(k, t0)
		if T.prof then T.prof[k] = (T.prof[k] or 0) + (clock() - t0) * 1000 end
		return clock()
	end
	function T.diff(keep)
		local tp = clock()
		keep = keep or { names = {}, params = {}, regs = {}, codes = {}, fams = {} }
		local base = T.base
		T.fontrefs, T.unsupported = {}, {}
		local rec = { v = 1, shipped = T.shipped, fires = T.fires, names = {}, macros = {}, tparams = {}, toks = {}, marks = {},
			params = {}, regs = {}, boxes = {}, codes = {}, fams = {}, nfss = {}, unsupported = {},
			base = { fires = base.fires, pagelen = base.pagelen, contriblen = base.contriblen } }
		local grabs = {}
		local refuse = {}
		local names = changed_names()
		local listed = {}
		for _, nm in ipairs(names) do listed[nm] = true end
		local extra = false
		for nm in pairs(keep.names) do
			if not listed[nm] then
				names[#names + 1] = nm
				extra = true
			end
		end
		if extra then table.sort(names) end
		for _, nm in ipairs(names) do
			local tk = token.create(nm)
			local cmd = tk.cmdname
			if cmd == "call" or cmd == "long_call" or cmd == "outer_call" or cmd == "long_outer_call" then
				local m = token.get_meaning(nm) or ""
				local ptxt = m:match("^(.-)%->") or ""
				local items, letters = {}, false
				if ptxt ~= "" then items, letters = param_items(ptxt) end
				if letters then refuse[#refuse + 1] = "letters delimit a parameter of " .. nm
				elseif not items or (ptxt ~= "" and cmd:find("outer")) then rec.unsupported[#rec.unsupported + 1] = "macro " .. nm
				else
					local mac = { n = nm, p = items, long = cmd:find("long") ~= nil, outer = cmd:find("outer") ~= nil, prot = tk.protected, h = md5.sumhexa(m) }
					rec.macros[#rec.macros + 1] = mac
					-- the same meaning gives the same tokens, up to catcodes a meaning does not show
					local c = captured[nm]
					if c and c.h == mac.h then mac.b = c.b
					else grabs[#grabs + 1] = { kind = "macro", into = mac } end
				end
			elseif cmd == "if_test" and (tk.mode == IFTRUE.mode or tk.mode == IFFALSE.mode) then
				rec.names[#rec.names + 1] = { n = nm, let = tk.mode == IFTRUE.mode and "iftrue" or "iffalse" }
			elseif cmd == "relax" and tk.mode == RELAX.mode then
				rec.names[#rec.names + 1] = { n = nm, let = "relax" }
			elseif cmd == "undefined_cs" then
				rec.names[#rec.names + 1] = { n = nm, let = PREFIX .. "undef" }
			elseif cmd == "set_font" then
				-- NFSS loads a font it has no name for: the apply selects it again through NFSS
				if nm:find("/", 1, true) then rec.nfss[#rec.nfss + 1] = nm
				else rec.unsupported[#rec.unsupported + 1] = "font identifier " .. nm end
			elseif cmd == "char_given" or cmd == "math_given" then
				rec.names[#rec.names + 1] = { n = nm, def = cmd == "char_given" and "chardef" or "mathchardef", v = tk.mode }
			elseif CHARCMD[cmd] then
				rec.names[#rec.names + 1] = { n = nm, char = { tk.command, tk.mode } }
			elseif REG_DEF[cmd] and REG_BASE[cmd] and tk.mode - REG_BASE[cmd] >= 0 and tk.mode - REG_BASE[cmd] <= 65535 then
				rec.names[#rec.names + 1] = { n = nm, def = REG_DEF[cmd], v = tk.mode - REG_BASE[cmd] }
			else
				local alias
				for _, p in ipairs(tex.primitives()) do
					local pt = token.create(p)
					if pt and pt.command == tk.command and pt.mode == tk.mode and pt.csname == p then
						alias = p
						break
					end
				end
				if alias then rec.names[#rec.names + 1] = { n = nm, let = alias }
				else rec.unsupported[#rec.unsupported + 1] = nm .. " (" .. cmd .. ")" end
			end
		end
		if #refuse > 0 then rec.refuse = table.concat(refuse, "; ") end
		tp = lap("names", tp)
		for _, pk in ipairs(params) do
			local p, k = pk[1], pk[2]
			local v = param_value(p, k)
			if v ~= base.params[p] or keep.params[p] then
				if k == "t" then
					local tp = { n = p }
					rec.tparams[#rec.tparams + 1] = tp
					grabs[#grabs + 1] = { kind = "tparam", into = tp }
				elseif k == "g" or k == "m" then rec.params[#rec.params + 1] = { p = p, k = k, v = glue_of(v) }
				else rec.params[#rec.params + 1] = { p = p, k = k, v = tonumber(v) } end
			end
		end
		tp = lap("params", tp)
		local bound = reg_bound()
		local s, b = regs_now(bound), base.regs
		-- a register allocated after the base was at its default there
		for i = 0, bound do
			if b.c[i] == nil then
				b.c[i], b.d[i], b.k[i], b.m[i] = 0, 0, "0,0,0,0,0", "0,0,0,0,0"
				b.a[i], b.t[i], b.box[i] = -0x7FFFFFFF, "", 0
			end
			local kr = keep.regs
			if s.c[i] ~= b.c[i] or kr["c" .. i] then rec.regs[#rec.regs + 1] = { k = "c", i = i, v = s.c[i] } end
			if s.d[i] ~= b.d[i] or kr["d" .. i] then rec.regs[#rec.regs + 1] = { k = "d", i = i, v = s.d[i] } end
			if s.k[i] ~= b.k[i] or kr["k" .. i] then rec.regs[#rec.regs + 1] = { k = "k", i = i, v = glue_of(s.k[i]) } end
			if s.m[i] ~= b.m[i] or kr["m" .. i] then rec.regs[#rec.regs + 1] = { k = "m", i = i, v = glue_of(s.m[i]) } end
			if s.a[i] ~= b.a[i] or kr["a" .. i] then rec.regs[#rec.regs + 1] = { k = "a", i = i, v = s.a[i] } end
			if s.t[i] ~= b.t[i] or kr["t" .. i] then
				local tr = { r = i }
				rec.toks[#rec.toks + 1] = tr
				grabs[#grabs + 1] = { kind = "toks", into = tr }
			end
			if s.box[i] ~= b.box[i] or kr["b" .. i] or (s.box[i] ~= 0 and base.boxdump[i] and box_dump(tex.getbox(i)) ~= base.boxdump[i]) then
				local bx = tex.getbox(i)
				if not bx then rec.regs[#rec.regs + 1] = { k = "bvoid", i = i }
				elseif not bx.head then
					rec.regs[#rec.regs + 1] = { k = "bempty", i = i, t = node.type(bx.id), w = bx.width, h = bx.height, d = bx.depth, s = bx.subtype }
				else rec.boxes[#rec.boxes + 1] = { i = i, list = T.ser_list(bx) } end
			end
		end
		tp = lap("regs", tp)
		-- the last shipped page's bottom marks become the next page's top marks
		if T.fires > base.fires then
			for c = 0, 1023 do
				if tex.getmark("bottom", c) then
					local mk = { c = c }
					rec.marks[#rec.marks + 1] = mk
					grabs[#grabs + 1] = { kind = "mark", into = mk }
				end
			end
		end
		local codes = codes_now()
		for c = 0, CODES do
			if codes[c] ~= base.codes[c] or keep.codes[c] then
				local v = {}
				for x in codes[c]:gmatch("[^,]+") do v[#v + 1] = x end
				local m = {}
				for x in v[5]:gmatch("[^.]+") do m[#m + 1] = tonumber(x) end
				rec.codes[#rec.codes + 1] = { c = c, cat = tonumber(v[1]), lc = tonumber(v[2]), uc = tonumber(v[3]), sf = tonumber(v[4]), math = m }
			end
		end
		tp = lap("codes", tp)
		local fam = fams_now()
		for k = 0, 255 * 3 + 2 do
			if (fam[k] ~= base.fam[k] or keep.fams[k]) and fam[k] ~= 0 then rec.fams[#rec.fams + 1] = { k = k, f = T.fontref(fam[k]) } end
		end
		rec.curfont = T.fontref(font.current())
		tp = lap("fams", tp)
		rec.page = T.ser_page(tex.lists.page_head)
		rec.contrib = T.ser_list(tex.lists.contrib_head)
		tp = lap("page", tp)
		rec.cstacks = T.color_stacks()
		rec.pagestate = { tex.pagegoal, tex.pagetotal, tex.pagedepth }
		rec.vsize_start = tex.pagegoal ~= MAXDIMEN and T.vsize_start() or nil
		rec.maxobj = pdf.getmaxobjnum()
		rec.prevdepth = tex.nest[0].prevdepth
		rec.prevgraf = tex.nest[0].prevgraf
		rec.carry = T.carry_get()
		for u in pairs(T.unsupported) do rec.unsupported[#rec.unsupported + 1] = u end
		table.sort(rec.unsupported)
		local fonts = {}
		for key, v in pairs(T.fontrefs) do fonts[key] = { v[1], v[2] } end
		rec.fonts = fonts
		rec.needs_glyph0 = T.has_glyph0(rec)
		lap("rest", tp)
		return rec, grabs
	end

	function T.has_glyph0(rec)
		local function walk(lst)
			for _, o in ipairs(lst or {}) do
				if o.id == "glyph" and (o.left == 0 or o.right == 0) then return true end
				for _, v in pairs(o) do
					if type(v) == "table" and v.list and walk(v.list) then return true end
				end
			end
			return false
		end
		if walk(rec.page) or walk(rec.contrib) then return true end
		for _, bx in ipairs(rec.boxes) do if walk(bx.list) then return true end end
		return false
	end

	-- exact tokens of a macro's one-level expansion or a token list, through a Lua scanner
	local grabbed
	local GRAB_ID = luatexbase.new_luafunction(PREFIX .. "grab")
	lua.get_functions_table()[GRAB_ID] = function() grabbed = token.scan_toks() end
	token.set_lua(PREFIX .. "grab", GRAB_ID, "global")
	for i = 1, 9 do token.set_macro(PREFIX .. "p" .. i, "", "global") end

	local function tokens_of(list)
		local out = {}
		for _, x in ipairs(list) do
			local pm = x.csname and x.csname:sub(1, #PREFIX + 1) == PREFIX .. "p" and tonumber(x.csname:sub(#PREFIX + 2))
			if pm then out[#out + 1] = { -1, pm }
			elseif x.active then out[#out + 1] = { 2, x.csname }
			elseif x.csname then
				if x.csname == "" or utf8.len(x.csname) == 1 then out[#out + 1] = { 1, x.csname }
				else out[#out + 1] = x.csname end
			else out[#out + 1] = { x.command, x.mode } end
		end
		return out
	end

	-- a one-character control sequence: token.create gives the character itself
	local single = {}
	local NEXT_ID = luatexbase.new_luafunction(PREFIX .. "next")
	local got_next
	lua.get_functions_table()[NEXT_ID] = function() got_next = token.get_next() end
	token.set_lua(PREFIX .. "next", NEXT_ID, "global")
	function T.single_cs(ch)
		if single[ch] then return single[ch] end
		tex.runtoks(function()
			tex.sprint({ token.create(PREFIX .. "next") })
			tex.sprint(-1, "\\" .. ch)
		end)
		single[ch] = got_next
		return got_next
	end

	function T.token_of(x)
		if type(x) == "string" then return token.create(x) end
		if x[1] == 2 and type(x[2]) == "string" then return token.create(utf8.codepoint(x[2]), 13) end
		if x[1] == 1 and type(x[2]) == "string" then return T.single_cs(x[2]) end
		return token.new(x[2], x[1])
	end

	-- every grab expands once inside \expandafter; `done` runs after the last one landed
	local pending
	function texpile_tele_got(i)
		local g = pending.grabs[i]
		g.into.b = tokens_of(grabbed)
		if g.kind == "macro" then captured[g.into.n] = { h = g.into.h, b = g.into.b } end
	end
	function texpile_tele_captured()
		local p = pending
		pending = nil
		p.done()
	end
	function T.capture(grabs, done)
		pending = { grabs = grabs, done = done }
		local EA, GRAB = token.create("expandafter"), token.create(PREFIX .. "grab")
		local LB, RB = token.new(123, 1), token.new(125, 2)
		-- single_cs runs TeX, which would also run whatever was already printed: resolve them first
		for _, g in ipairs(grabs) do
			for _, it in ipairs(g.into.p or {}) do if type(it) == "table" and it[1] == 1 and type(it[2]) == "string" then T.single_cs(it[2]) end end
		end
		for gi, g in ipairs(grabs) do
			if g.kind == "macro" then
				local seq = { EA, GRAB, EA, LB, token.create(g.into.n) }
				for _, it in ipairs(g.into.p) do
					if type(it) == "table" and it[1] == -1 then
						seq[#seq + 1] = LB
						seq[#seq + 1] = token.create(PREFIX .. "p" .. it[2])
						seq[#seq + 1] = RB
					else seq[#seq + 1] = T.token_of(it) end
				end
				seq[#seq + 1] = RB
				tex.sprint(seq)
			elseif g.kind == "tparam" then
				tex.sprint({ EA, GRAB, EA, LB, token.create("the"), token.create(g.into.n), RB })
			else
				-- a number ends at a space, which TeX eats; anything else would stay in the list
				tex.sprint({ EA, GRAB, EA, LB, token.create(g.kind == "mark" and "botmarks" or "the") })
				if g.kind == "toks" then tex.sprint({ token.create("toks") }) end
				tex.sprint(tostring(g.into.r or g.into.c) .. " ")
				tex.sprint({ RB })
			end
			tex.sprint("\\directlua{texpile_tele_got(" .. gi .. ")}")
		end
		tex.sprint("\\directlua{texpile_tele_captured()}")
	end
end
