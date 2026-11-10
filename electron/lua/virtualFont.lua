-- A virtual font (Times through T1, newtx, ...) has no file of its own: the PDF draws each of its characters from the
-- real fonts its .vf names, and the records do the same, so the renderer meets only fonts it can draw.
return function()
	local vfs, tfms = {}, {}
	-- the real fonts glyphs were drawn from, by negative id: a font record per page names each
	local faces, faceIds = {}, {}

	local function cached(store, read, name, size)
		local key = name .. "@" .. size
		local v = store[key]
		if v == nil then
			local ok, got = pcall(read, name, size)
			v = ok and got or false
			store[key] = v
		end
		return v
	end

	local function faceId(name, size)
		local key = name .. "@" .. size
		local id = faceIds[key]
		if not id then
			faces[#faces + 1] = { name = name, size = size }
			id = -#faces
			faceIds[key] = id
		end
		return id
	end

	local function widthOf(f, c)
		local t = cached(tfms, font.read_tfm, f.name, f.size)
		local ch = t and t.characters and t.characters[c]
		return ch and ch.width or 0
	end

	-- character c of the font at x, y through out.glyph and out.rule; false when the font is not virtual. `scale` is
	-- the glyph's font expansion
	local function expand(name, size, c, x, y, scale, out, depth)
		local vf = depth < 4 and cached(vfs, font.read_vf, name, size)
		local ch = vf and vf.characters and vf.characters[c]
		if not (ch and ch.commands) then return false end
		local stack, cur = {}, vf.fonts and vf.fonts[1]
		for _, cmd in ipairs(ch.commands) do
			local op = cmd[1]
			if op == "font" then cur = vf.fonts[cmd[2]]
			elseif op == "char" or op == "slot" then
				local f, code = cur, cmd[2]
				if op == "slot" then f, code = vf.fonts[cmd[2]], cmd[3] end
				if f then
					local w = widthOf(f, code) * scale
					if not expand(f.name, f.size, code, x, y, scale, out, depth + 1) then out.glyph(faceId(f.name, f.size), code, x, y, w) end
					x = x + w
				end
			elseif op == "right" then x = x + cmd[2] * scale
			elseif op == "down" then y = y + cmd[2]
			elseif op == "push" then stack[#stack + 1] = { x, y }
			elseif op == "pop" then
				local s = table.remove(stack)
				if s then x, y = s[1], s[2] end
			elseif op == "rule" then
				local w = cmd[3] * scale
				if cmd[2] > 0 and w > 0 then out.rule(x, y, w, cmd[2]) end
				x = x + w
			end
		end
		return true
	end

	return {
		-- a glyph node of a font with no file: its real glyphs and rules go out, and true; false leaves it as it is
		expand = function(f, n, x, y, scale, out)
			return f ~= nil and (f.filename == nil or f.filename == "") and f.name ~= nil
				and expand(f.name, f.size, n.char, x, y, scale, out, 0)
		end,
		face = function(id) return faces[-id] end,
	}
end
