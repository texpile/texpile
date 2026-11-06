-- Puts a record's state back, each part the way TeX itself makes it, then hands over to `after(fails)`.
return function(T)
	local PREFIX = "texpiletele@"
	local MAXDIMEN = 1073741823
	local WHATSIT = node.id("whatsit")
	local COLORSTACK = node.subtype("pdf_colorstack")
	local GLUE, HLIST, VLIST, RULE = node.id("glue"), node.id("hlist"), node.id("vlist"), node.id("rule")
	local FAMCMD = { "textfont", "scriptfont", "scriptscriptfont" }
	local A

	local function G() return token.create("global") end

	local function names_in(r)
		local seen, list = {}, {}
		local function add(n)
			if type(n) == "string" and n ~= "" and not seen[n] then
				seen[n] = true
				list[#list + 1] = n
			end
		end
		local function toks(t)
			for _, x in ipairs(t or {}) do
				if type(x) == "string" then add(x) elseif x.n then add(x.n) end
			end
		end
		for _, n in ipairs(r.names) do add(n.n) end
		for _, m in ipairs(r.macros) do add(m.n); toks(m.p); toks(m.b) end
		for _, g in ipairs(r.tparams) do toks(g.b) end
		for _, g in ipairs(r.toks) do toks(g.b) end
		for _, g in ipairs(r.marks) do toks(g.b) end
		local function walk(lst)
			for _, o in ipairs(lst or {}) do
				for _, v in pairs(o) do
					if type(v) == "table" and v.list then walk(v.list)
					elseif type(v) == "table" and v.toks then toks(v.toks) end
				end
			end
		end
		walk(r.page)
		walk(r.contrib)
		for _, b in ipairs(r.boxes) do walk(b.list) end
		return list
	end

	function T.apply(r, after)
		A = { r = r, after = after, t0 = os.gettimeofday(), fontcs = {} }
		T.setfail = {}
		for _, n in ipairs(names_in(r)) do
			local tk = token.create(n)
			if not tk or tk.csname ~= n then
				tex.sprint("\\expandafter\\let\\csname ")
				tex.sprint(-2, n)
				tex.sprint("\\endcsname")
				tex.sprint({ token.create(PREFIX .. "undef") })
			end
		end
		local keys = {}
		for key in pairs(r.fonts or {}) do keys[#keys + 1] = key end
		table.sort(keys)
		for k, key in ipairs(keys) do
			local spec = r.fonts[key]
			local cs = PREFIX .. "f" .. k
			token.set_macro(cs, "", "global")
			A.fontcs[key] = cs
			tex.sprint({ G(), token.create("font"), token.create(cs) })
			tex.sprint(-2, '"' .. spec[1] .. '"')
			tex.sprint(" at " .. spec[2] .. "sp\\relax")
		end
		if r.needs_glyph0 and not T.glyph0 then
			tex.sprint("\\begingroup\\setbox0\\hbox{$x$}\\directlua{texpile_tele_proto()}\\endgroup")
		end
		-- a font NFSS loaded goes through NFSS again before any macro comes back: the font hooks (microtype's
		-- protrusion codes, \hyphenchar) set it up as they did, and the record's macros then overwrite their bookkeeping
		for _, nm in ipairs(r.nfss or {}) do
			local enc, fam, ser, shp, size = nm:match("^([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)$")
			if enc then
				tex.sprint("\\begingroup\\fontencoding{")
				tex.sprint(-2, enc)
				tex.sprint("}\\fontfamily{")
				tex.sprint(-2, fam)
				tex.sprint("}\\fontseries{")
				tex.sprint(-2, ser)
				tex.sprint("}\\fontshape{")
				tex.sprint(-2, shp)
				tex.sprint("}\\fontsize{")
				tex.sprint(-2, size)
				tex.sprint("}{0pt}\\selectfont\\endgroup")
			end
		end
		tex.sprint("\\directlua{texpile_tele_apply2()}")
	end

	function texpile_tele_proto()
		local g = T.find_glyph0(tex.box[0].head)
		if g then T.glyph0 = node.copy(g) end
	end

	local function built(list)
		local out = {}
		for _, x in ipairs(list or {}) do
			if type(x) == "table" and x[1] == -1 then out[#out + 1] = { param = x[2] }
			else out[#out + 1] = T.token_of(x) end
		end
		return out
	end

	function texpile_tele_apply2()
		local r = A.r
		for key, cs in pairs(A.fontcs) do T.fontmap[key] = token.create(cs).mode end
		local L = token.create("let")
		local LB, RB = token.new(123, 1), token.new(125, 2)
		local HASH = token.new(35, 6)
		-- token_of runs TeX for one-character names, which would also run whatever was already printed
		local B = {}
		A.built = B
		for _, m in ipairs(r.macros) do B[m] = { p = built(m.p), b = built(m.b) } end
		for _, g in ipairs(r.tparams) do B[g] = { b = built(g.b) } end
		for _, g in ipairs(r.toks) do B[g] = { b = built(g.b) } end
		for _, g in ipairs(r.marks) do B[g] = { b = built(g.b) } end
		for _, n in ipairs(r.names) do
			local name = token.create(n.n)
			if n.let then tex.sprint({ G(), L, name, token.create(n.let) })
			elseif n.char then tex.sprint({ G(), L, name, token.new(n.char[2], n.char[1]) })
			elseif n.font then
				local cs = A.fontcs[n.font]
				if cs then tex.sprint({ G(), L, name, token.create(cs) }) else T.setfail["font " .. n.n] = true end
			elseif n.def then
				tex.sprint({ G(), token.create(n.def), name })
				tex.sprint("=" .. n.v .. "\\relax")
			end
		end
		for _, m in ipairs(r.macros) do
			local seq = { G() }
			if m.long then seq[#seq + 1] = token.create("long") end
			if m.outer then seq[#seq + 1] = token.create("outer") end
			if m.prot then seq[#seq + 1] = token.create("protected") end
			seq[#seq + 1] = token.create("def")
			seq[#seq + 1] = token.create(m.n)
			for _, x in ipairs(B[m].p) do
				if type(x) == "table" and x.param then
					seq[#seq + 1] = HASH
					seq[#seq + 1] = token.new(48 + x.param, 12)
				else seq[#seq + 1] = x end
			end
			seq[#seq + 1] = LB
			for _, x in ipairs(B[m].b) do
				if type(x) == "table" and x.param then
					seq[#seq + 1] = HASH
					seq[#seq + 1] = token.new(48 + x.param, 12)
				else
					seq[#seq + 1] = x
					-- a parameter character in a body is doubled in its definition
					if x.cmdname == "mac_param" then seq[#seq + 1] = x end
				end
			end
			seq[#seq + 1] = RB
			B[m].seq = seq
			tex.sprint(seq)
		end
		for _, g in ipairs(r.tparams) do
			local seq = { G(), token.create(g.n), LB }
			for _, x in ipairs(B[g].b) do seq[#seq + 1] = x end
			seq[#seq + 1] = RB
			tex.sprint(seq)
		end
		for _, g in ipairs(r.toks) do
			tex.sprint({ G(), token.create("toks") })
			tex.sprint(tostring(g.r) .. "=")
			local seq = { LB }
			for _, x in ipairs(B[g].b) do seq[#seq + 1] = x end
			seq[#seq + 1] = RB
			tex.sprint(seq)
		end
		-- the current font follows the restored NFSS state, before the parameters are set
		tex.sprint("\\selectfont\\directlua{texpile_tele_apply3()}")
	end

	local function glue_spec(v)
		local g = node.new("glue_spec")
		g.width, g.stretch, g.shrink, g.stretch_order, g.shrink_order = v[1], v[2], v[3], v[4], v[5]
		return g
	end

	function texpile_tele_apply3()
		local r = A.r
		-- \selectfont rewrites some of what was just restored (\font@name): define those again
		for _, m in ipairs(r.macros) do
			if A.built[m].seq and T.meaning_hash(m.n) ~= m.h then tex.sprint(A.built[m].seq) end
		end
		for _, p in ipairs(r.params) do
			if p.k == "m" then
				-- Lua sets no math glue parameter: TeX copies it from a spare \muskip, cleared after
				local v = p.v
				tex.setmuglue(65535, v[1], v[2], v[3], v[4], v[5])
				tex.sprint("\\global\\" .. p.p .. "=\\muskip65535\\global\\muskip65535=0mu\\relax")
			elseif p.k == "g" then tex.set("global", p.p, glue_spec(p.v))
			else tex.set("global", p.p, p.v) end
		end
		for _, g in ipairs(r.regs) do
			local k, i, v = g.k, g.i, g.v
			if k == "c" then tex.setcount("global", i, v)
			elseif k == "d" then tex.setdimen("global", i, v)
			elseif k == "a" then tex.setattribute("global", i, v)
			elseif k == "k" then tex.setskip("global", i, glue_spec(v))
			elseif k == "m" then tex.setmuskip("global", i, glue_spec(v))
			elseif k == "bvoid" then tex.setbox("global", i, nil)
			elseif k == "bempty" then
				local b = node.new(g.t)
				b.width, b.height, b.depth, b.subtype = g.w, g.h, g.d, g.s
				tex.setbox("global", i, b)
			end
		end
		for _, c in ipairs(r.codes) do
			tex.setcatcode("global", c.c, c.cat)
			tex.setlccode("global", c.c, c.lc)
			tex.setuccode("global", c.c, c.uc)
			tex.setsfcode("global", c.c, c.sf)
			tex.setmathcode("global", c.c, #c.math == 1 and c.math[1] or c.math)
		end
		for _, f in ipairs(r.fams) do
			local cs = A.fontcs[f.f]
			if cs then
				tex.sprint({ G(), token.create(FAMCMD[f.k % 3 + 1]) })
				tex.sprint(tostring(f.k // 3) .. "=")
				tex.sprint({ token.create(cs) })
			end
		end
		if A.fontcs[r.curfont] then tex.sprint({ token.create(A.fontcs[r.curfont]) }) end
		-- graphics keeps each image in a macro named for the file (\useimageresource <index>), and an image's index
		-- is its PDF object number: the images load again in index order, the numbers below each taken first
		local imgs = {}
		for _, m in ipairs(r.macros) do
			local file, hash = m.n:match("^(.-) image(.*)$")
			local b = m.b
			if file and (hash == "" or hash:sub(1, 1) == ":") and b and b[1] == "useimageresource" then
				local digits = {}
				for i = 2, #b do if type(b[i]) == "table" and b[i][1] == 12 then digits[#digits + 1] = utf8.char(b[i][2]) end end
				local idx = tonumber(table.concat(digits))
				if idx then imgs[#imgs + 1] = { idx = idx, file = file, hash = hash } end
			end
		end
		table.sort(imgs, function(a, b) return a.idx < b.idx end)
		for _, im in ipairs(imgs) do
			if im.idx > tex.lastsavedimageresourceindex then
				local box, page, decode = im.hash:match("^:(%a+)"), im.hash:match(":P(%d+)"), im.hash:match(":D(%b[])")
				local interp = im.hash:find(":I", 1, true)
				local cmd = "\\saveimageresource "
				if decode or interp then cmd = cmd .. "attr{" .. (decode and ("/Decode" .. decode) or "") .. (interp and "/Interpolate true" or "") .. "}" end
				if page then cmd = cmd .. " page " .. page end
				if box then cmd = cmd .. " " .. box end
				tex.sprint("\\directlua{texpile_tele_reserve(" .. (im.idx - 1) .. ")}")
				tex.sprint(cmd .. "{")
				tex.sprint(-2, im.file)
				tex.sprint("}\\directlua{texpile_tele_imgcheck(" .. im.idx .. ")}")
			end
		end
		-- object numbers the restored nodes and macros hold must not be handed out again
		tex.sprint("\\directlua{texpile_tele_reserve(" .. (r.maxobj or 0) .. ")}")
		tex.sprint("\\directlua{texpile_tele_apply4()}")
	end

	function texpile_tele_reserve(n)
		while pdf.getmaxobjnum() < n do pdf.reserveobj() end
	end
	function texpile_tele_imgcheck(n)
		if tex.lastsavedimageresourceindex ~= n then T.setfail["image " .. n .. " loaded as " .. tex.lastsavedimageresourceindex] = true end
	end

	local function resource_refs(lst, acc)
		for _, o in ipairs(lst or {}) do
			if o.id == "rule" and o.st == 2 then acc.img = math.max(acc.img, o.index or 0)
			elseif o.id == "rule" and o.st == 1 then acc.box = math.max(acc.box, o.index or 0) end
			for _, v in pairs(o) do if type(v) == "table" and v.list then resource_refs(v.list, acc) end end
		end
		return acc
	end

	local function same_prefix(head, lst, k)
		local n = head
		for i = 1, k do
			if not n or not lst[i] or node.type(n.id) ~= lst[i].id or n.subtype ~= lst[i].st then return false end
			n = n.next
		end
		return true
	end

	function texpile_tele_apply4()
		local r = A.r
		-- a node pointing at an image this process does not have crashes the backend at shipout
		local acc = resource_refs(r.page, resource_refs(r.contrib, { img = 0, box = 0 }))
		for _, b in ipairs(r.boxes) do resource_refs(b.list, acc) end
		if acc.img > tex.lastsavedimageresourceindex or acc.box > tex.lastsavedboxresourceindex then
			T.refuse(string.format("the page uses image %d and box resource %d", acc.img, acc.box))
			return
		end
		for _, b in ipairs(r.boxes) do tex.setbox("global", b.i, T.des_list(b.list)) end
		-- at the base, the base's own page items are still there while no output has run since
		local b = r.base
		A.keep = T.at_base and r.fires == b.fires and b.pagelen <= #r.page and same_prefix(tex.lists.page_head, r.page, b.pagelen)
		-- no setter for a bottom mark, and emptying the page from Lua leaves the page builder mid-page: one page holding
		-- the marks and whatever the process had on its page goes through an output routine that drops it
		if #r.marks > 0 or (not A.keep and node.length(tex.lists.page_head) > 0) then
			A.saved = { outputpenalty = tex.outputpenalty, deadcycles = tex.deadcycles }
			tex.sprint("\\begingroup\\output{\\setbox0\\box255 \\deadcycles0 }\\hbox{}")
			for _, g in ipairs(r.marks) do
				tex.sprint({ token.create("marks") })
				tex.sprint(g.c .. " ")
				-- \marks expands its text, which these tokens already are
				local seq = { token.new(123, 1), token.create("unexpanded"), token.new(123, 1) }
				for _, x in ipairs(A.built[g].b) do seq[#seq + 1] = x end
				seq[#seq + 1] = token.new(125, 2)
				seq[#seq + 1] = token.new(125, 2)
				tex.sprint(seq)
			end
			tex.sprint("\\penalty-10000 \\endgroup\\directlua{texpile_tele_apply4b()}")
		else
			texpile_tele_apply4b()
		end
	end

	function texpile_tele_apply4b()
		local r = A.r
		if A.saved then
			tex.set("global", "outputpenalty", A.saved.outputpenalty)
			tex.deadcycles = A.saved.deadcycles
		end
		local page = r.page
		if A.keep then
			page = {}
			for i = r.base.pagelen + 1, #r.page do page[#page + 1] = r.page[i] end
		end
		if node.length(tex.lists.contrib_head) > 0 then
			local old = tex.lists.contrib_head
			tex.lists.contrib_head = nil
			node.flush_list(old)
		end
		local head = T.des_list(page)
		T.push_colors(r.cstacks)
		-- the page builder drops the recorded topskip glue and makes its own from \topskip and the first box:
		-- for that moment \topskip is what gives the recorded glue back
		for n in node.traverse(head) do
			if n.id == GLUE and n.subtype == 10 then
				local bx = n.next
				while bx and not (bx.id == HLIST or bx.id == VLIST or bx.id == RULE) do bx = bx.next end
				if bx then
					A.topskip = { tex.getglue("topskip") }
					tex.setglue("topskip", n.width > 0 and n.width + bx.height or 0, n.stretch, n.shrink, n.stretch_order, n.shrink_order)
				end
				break
			end
			if n.id == HLIST or n.id == VLIST or n.id == RULE then break end
		end
		A.contrib = T.des_list(r.contrib)
		-- the goal came from \vsize when the page took its first box, whatever \vsize is now
		if r.vsize_start then
			A.vsize = tex.vsize
			tex.set("vsize", r.vsize_start)
		end
		T.rebuilding = true
		-- TeX's own page builder moves the page's items onto the page again, at TeX's own \par
		if head then node.write(head) end
		tex.sprint({ token.create(PREFIX .. "par") })
		tex.sprint("\\directlua{texpile_tele_apply4c()}")
	end

	function texpile_tele_apply4c()
		local r = A.r
		T.rebuilding = false
		if A.vsize then tex.set("vsize", A.vsize) end
		-- the page builder keeps its best break so far where nothing can set it: a page whose goal a class moved
		-- after it began (REVTeX's grid) rebuilds differently
		local ps = r.pagestate
		if tex.pagegoal ~= ps[1] or tex.pagetotal ~= ps[2] or tex.pagedepth ~= ps[3] then
			T.setfail[string.format("page state %d/%d/%d against %d/%d/%d", tex.pagegoal, tex.pagetotal, tex.pagedepth, ps[1], ps[2], ps[3])] = true
		end
		-- what was still waiting for the page builder goes back unbuilt
		if A.contrib then node.write(A.contrib) end
		tex.sprint("\\directlua{texpile_tele_apply5()}")
	end

	function texpile_tele_apply5()
		local r = A.r
		-- what the apply itself left behind (NFSS writes \font@name globally) goes back to the base
		local listed = {}
		for _, n in ipairs(r.names) do listed[n.n] = true end
		for _, m in ipairs(r.macros) do listed[m.n] = true end
		for _, n in ipairs(r.nfss) do listed[n] = true end
		local seq, other = {}, {}
		local L = token.create("let")
		for _, nm in ipairs(T.changed_names()) do
			if not listed[nm] then
				local back = T.pin_of[nm] or (T.fresh_name(nm) and PREFIX .. "undef")
				if back then
					seq[#seq + 1] = G()
					seq[#seq + 1] = L
					seq[#seq + 1] = token.create(nm)
					seq[#seq + 1] = token.create(back)
				else other[#other + 1] = nm end
			end
		end
		if #other > 0 then T.setfail["left changed: " .. table.concat(other, ", ", 1, math.min(#other, 6))] = true end
		tex.sprint(seq)
		tex.sprint("\\directlua{texpile_tele_apply6()}")
	end

	function texpile_tele_apply6()
		local r = A.r
		if A.topskip then tex.setglue("topskip", table.unpack(A.topskip)) end
		tex.nest[0].prevdepth = r.prevdepth
		tex.nest[0].prevgraf = r.prevgraf
		T.shipped, T.fires = r.shipped, r.fires
		T.page_epoch = T.page_epoch + 1
		T.carry_set(r.carry)
		T.at_base = false
		local fails = {}
		for k in pairs(T.setfail) do fails[#fails + 1] = k end
		local bad = {}
		for _, m in ipairs(r.macros) do
			if T.meaning_hash(m.n) ~= m.h then bad[#bad + 1] = m.n end
		end
		if #bad > 0 then fails[#fails + 1] = "meanings differ: " .. table.concat(bad, ", ", 1, math.min(#bad, 6)) end
		table.sort(fails)
		local a = A
		A = nil
		a.after(fails, (os.gettimeofday() - a.t0) * 1000)
	end
end
