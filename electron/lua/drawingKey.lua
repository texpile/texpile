-- What a drawing region shows, as one hash: a page the compile's PDF does not have takes a drawing from the compile
-- page holding the same one. Line stamps and what differs between processes (font ids, image indexes) stay out.
local GLYPH, HLIST, VLIST, GLUE, KERN, RULE = node.id("glyph"), node.id("hlist"), node.id("vlist"), node.id("glue"), node.id("kern"), node.id("rule")
local DISC, PENALTY, MATH, WHATSIT = node.id("disc"), node.id("penalty"), node.id("math"), node.id("whatsit")
local LITERAL, LATE_LITERAL = node.subtype("pdf_literal"), node.subtype("pdf_late_literal")
local COLORSTACK, SETMATRIX = node.subtype("pdf_colorstack"), node.subtype("pdf_setmatrix")
local IMAGE_RULE = 2
local ok, rules = pcall(node.subtypes, "rule")
for i, name in pairs(ok and rules or {}) do
	if name == "image" then IMAGE_RULE = i end
end

-- fontKey(id): the font as name and size; imageFile(index): the file an image resource came from
return function(fontKey, imageFile)
	return function(box, color)
		local parts = { color or "" }
		local function add(...)
			for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
		end
		local function walk(n)
			while n do
				local id = n.id
				add(id, n.subtype)
				if id == HLIST or id == VLIST then
					add(n.width, n.height, n.depth, n.shift, n.glue_set, n.glue_sign, n.glue_order)
					walk(n.head)
				elseif id == GLYPH then add(n.char, fontKey(n.font), n.xoffset, n.yoffset)
				elseif id == GLUE then
					add(n.width, n.stretch, n.shrink, n.stretch_order, n.shrink_order)
					walk(n.leader)
				elseif id == KERN then add(n.kern)
				elseif id == RULE then
					add(n.width, n.height, n.depth)
					if n.subtype == IMAGE_RULE then add(imageFile(n.index) or "?") end
				elseif id == DISC then walk(n.replace)
				elseif id == PENALTY then add(n.penalty)
				elseif id == MATH then add(n.surround)
				elseif id == WHATSIT then
					local st = n.subtype
					if st == LITERAL or st == LATE_LITERAL then add(n.mode, n.data)
					elseif st == COLORSTACK then add(n.stack, n.command, n.data)
					elseif st == SETMATRIX then add(n.data) end
				end
				n = n.next
			end
		end
		add(box.width, box.height, box.depth, box.glue_set, box.glue_sign, box.glue_order)
		walk(box.head)
		return md5.sumhexa(table.concat(parts, "|"))
	end
end
