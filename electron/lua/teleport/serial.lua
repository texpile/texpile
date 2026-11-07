-- Records as Lua source, and nodes and tokens to and from plain tables.
return function(T)
	local CSFLAG = 536870911
	local ATTRIBUTE = node.id("attribute")
	local GLYPH = node.id("glyph")
	local WHATSIT = node.id("whatsit")
	local WRITE = node.subtype("write")
	-- node.fields names the color stack's operation cmd, the getter and setter only answer to command
	local FIELD_ALIAS = { cmd = "command" }
	local SKIP = { id = true, subtype = true, next = true, prev = true, attr = true }
	local READONLY = { width = true, height = true, depth = true }

	-- deterministic Lua source: arrays in order, map keys sorted, so two equal states print equal text
	-- skip names top-level keys only
	local function dump(v, out, skip)
		local t = type(v)
		if t == "table" then
			out[#out + 1] = "{"
			local n = #v
			for i = 1, n do
				dump(v[i], out)
				out[#out + 1] = ","
			end
			local keys = {}
			for k in pairs(v) do
				if not (type(k) == "number" and k >= 1 and k <= n and k % 1 == 0) and not (skip and skip[k]) then keys[#keys + 1] = k end
			end
			table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
			for _, k in ipairs(keys) do
				if type(k) == "string" and k:match("^[%a_][%w_]*$") then out[#out + 1] = k .. "="
				else out[#out + 1] = "[" .. (type(k) == "string" and string.format("%q", k) or tostring(k)) .. "]=" end
				dump(v[k], out)
				out[#out + 1] = ","
			end
			out[#out + 1] = "}"
		elseif t == "string" then out[#out + 1] = string.format("%q", v)
		elseif t == "number" then
			out[#out + 1] = (v == math.floor(v) and v >= -2 ^ 53 and v <= 2 ^ 53) and string.format("%d", v) or string.format("%.17g", v)
		else out[#out + 1] = tostring(v) end
		return out
	end
	function T.dump(v, skip) return table.concat(dump(v, {}, skip)) end

	function T.write_record(path, rec)
		local f = io.open(path, "w")
		if not f then return false end
		f:write("return ", T.dump(rec), "\n")
		f:close()
		return true
	end

	function T.read_record(path)
		local ok, rec = pcall(dofile, path)
		if ok and type(rec) == "table" then return rec end
		return nil
	end

	-- names by hash position, for control sequences inside node token lists
	local ptr2name, ptr2name_count
	local function cs_names()
		if ptr2name and ptr2name_count == status.cs_count then return ptr2name end
		ptr2name, ptr2name_count = {}, status.cs_count
		for k, v in pairs(tex.hashtokens()) do
			local nm = type(k) == "string" and k or v
			if type(nm) == "string" and #nm > 1 and nm:sub(1, 12) ~= "texpiletele@" then
				local tk = token.create(nm)
				if tk and tk.csname == nm then ptr2name[tk.tok - CSFLAG] = nm end
			end
		end
		return ptr2name
	end

	-- a font's name and size never change, and reading its table from TeX is slow
	local font_info = {}
	local function info_of(id)
		local i = font_info[id]
		if i == nil then
			local f = font.getfont(id) or (font.getcopy and font.getcopy(id))
			i = f and f.name and { f.name, f.size } or false
			font_info[id] = i
		end
		return i
	end
	function T.fontkey(id)
		local i = info_of(id)
		return i and (i[1] .. "@" .. i[2]) or nil
	end
	local function fontref(id)
		if not id or id == 0 then return 0 end
		local i = info_of(id)
		if not i then return 0 end
		local key = i[1] .. "@" .. i[2]
		T.fontrefs[key] = { i[1], i[2], id }
		return key
	end
	T.fontref = fontref

	local function ser_tokens(tl)
		local out = {}
		for i, x in ipairs(tl) do
			-- a list's first entry is its reference count: how many places share it, which no state compares
			if i == 1 and x[1] == 0 and not (x[3] and x[3] ~= 0) then out[1] = { 0, 0 }
			elseif x[3] and x[3] ~= 0 then
				-- a named one goes back by its name, so its meaning at this moment is left out
				local nm = cs_names()[x[3]]
				out[#out + 1] = nm and { n = nm } or { c = x[1], m = x[2], p = x[3] }
			else out[#out + 1] = { x[1], x[2] } end
		end
		return out
	end

	local ser_list
	local function ser_node(n)
		local o = { id = node.type(n.id), st = n.subtype or 0 }
		if n.attr then
			local a = {}
			for x in node.traverse(n.attr) do
				if x.id == ATTRIBUTE then a[#a + 1] = { x.number, x.value } end
			end
			if #a > 0 then o.attr = a end
		end
		local fields = node.fields(n.id, n.subtype) or {}
		local has_head = false
		for _, f in ipairs(fields) do if f == "head" then has_head = true end end
		-- a write's text expands when read, and it only reaches the .aux
		local is_write = n.id == WHATSIT and n.subtype == WRITE
		for _, f0 in ipairs(fields) do
			local f = f0
			if not SKIP[f] and not (f == "list" and has_head) and not (is_write and f == "data") then
				local ok, v = pcall(function() return n[f] end)
				if ok and v == nil and FIELD_ALIAS[f] then
					f = FIELD_ALIAS[f]
					ok, v = pcall(function() return n[f] end)
				end
				if ok and v ~= nil then
					local tv = type(v)
					if f == "font" and n.id == GLYPH then o.font = fontref(v)
					elseif tv == "number" or tv == "boolean" or tv == "string" then o[f] = v
					elseif tv == "userdata" and node.is_node(v) then o[f] = { list = ser_list(v) }
					elseif tv == "table" then o[f] = { toks = ser_tokens(v) }
					else T.unsupported["field " .. o.id .. "." .. f] = true end
				end
			end
		end
		return o
	end
	function ser_list(head)
		local out = {}
		local n = head
		while n do
			out[#out + 1] = ser_node(n)
			n = n.next
		end
		return out
	end
	T.ser_list = ser_list

	-- items already on the page are never touched again until an output routine or an apply empties it
	local page_cache, page_cache_epoch = {}, -1
	function T.ser_page(head)
		if T.page_epoch ~= page_cache_epoch then
			page_cache, page_cache_epoch = {}, T.page_epoch
		end
		local out, fresh = {}, {}
		local n = head
		while n do
			local d = node.direct.todirect(n)
			local e = page_cache[d]
			if not e then
				local saved_f, saved_u = T.fontrefs, T.unsupported
				T.fontrefs, T.unsupported = {}, {}
				e = { ser_node(n), T.fontrefs, T.unsupported }
				T.fontrefs, T.unsupported = saved_f, saved_u
			end
			for k, v in pairs(e[2]) do T.fontrefs[k] = v end
			for k in pairs(e[3]) do T.unsupported[k] = true end
			fresh[d] = e
			out[#out + 1] = e[1]
			n = n.next
		end
		page_cache = fresh
		return out
	end

	-- back from tables
	local function des_tokens(tl)
		local out = {}
		for i, x in ipairs(tl) do
			-- the first entry is the list's reference count (shared lists count above 0); LuaTeX adds its own
			if not (i == 1 and x[1] == 0 and not x.n and not x.p) then
				if x.n then
					local tk = token.create(x.n)
					if tk and tk.csname == x.n then out[#out + 1] = { tk.command, tk.mode, tk.tok - CSFLAG }
					else out[#out + 1] = { 0, 0, 0 } end
				elseif x.p then out[#out + 1] = { x.c, x.m, x.p }
				else out[#out + 1] = { x[1], x[2], 0 } end
			end
		end
		return out
	end

	-- Lua writes a glyph's hyphen minimum 0 as 255; a math glyph carries 0, so such glyphs start from a copy of one
	function T.find_glyph0(head)
		for n in node.traverse(head) do
			if n.id == GLYPH and n.left == 0 and n.right == 0 then return n end
			if n.head then
				local g = T.find_glyph0(n.head)
				if g then return g end
			end
		end
	end

	local des_list
	local function des_node(o)
		local n
		if o.id == "glyph" and (o.left == 0 or o.right == 0) and T.glyph0 then
			n = node.copy(T.glyph0)
			n.subtype = o.st
		else
			n = node.new(o.id, o.st)
		end
		-- in LuaTeX's own field order: setting lang resets left and right
		for _, k0 in ipairs(node.fields(n.id, n.subtype) or {}) do
			local k = k0
			if o[k] == nil and FIELD_ALIAS[k] then k = FIELD_ALIAS[k] end
			local v = o[k]
			-- LuaTeX expands a write's data to read it, and a new write's empty list reads whatever TeX's memory holds
			local write_data = k == "data" and n.id == WHATSIT and n.subtype == WRITE
			if v == nil and write_data then v = "" end
			if v ~= nil and k ~= "id" and k ~= "subtype" and k ~= "attr" then
				local val = v
				if k == "font" and o.id == "glyph" then val = T.fontmap[v] or 0
				elseif type(v) == "table" and v.list then val = des_list(v.list)
				elseif type(v) == "table" and v.toks then val = des_tokens(v.toks) end
				if not (o.id == "glyph" and (READONLY[k] or ((k == "left" or k == "right") and v == 0))) then
					-- writing lang turns a hyphen minimum of 0 into 255, so equal values are left alone
					local same = not write_data and type(val) ~= "table" and type(val) ~= "userdata" and n[k] == val
					local ok = same or pcall(function() n[k] = val end)
					if not ok then T.setfail[o.id .. "." .. k] = true end
				end
			end
		end
		-- node.new hands out the current attributes; the record's own (or none) replace them
		pcall(function() n.attr = nil end)
		for _, a in ipairs(o.attr or {}) do node.set_attribute(n, a[1], a[2]) end
		return n
	end
	function des_list(lst)
		local head, tail
		for _, o in ipairs(lst or {}) do
			local n = des_node(o)
			if tail then
				tail.next = n
				n.prev = tail
			else head = n end
			tail = n
		end
		return head
	end
	T.des_list = des_list
end
