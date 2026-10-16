-- the commands a \usepackage adds or redefines, with the arguments TeX says each takes (packageProbe.ts runs it)
-- writes <jobname>.probe: name<TAB>spec<TAB>marks; spec is m/o tokens, or "X <xparse spec>"; marks holds r when
-- the command existed before and d when another package defined it while the probed one loaded it

local before = {}
local out = {}
local document_commands = {}
local marks = {}
local target = ""
local base = ""
-- one entry per file being read: true when it is, or sits inside, another package
local reading = {}
local dependency_before = nil
-- \@onlypreamble commands turn into an error at \begin{document}; what they meant in the preamble stands in
local preamble = {}
local preamble_specs = {}

local function meaning(name)
  if preamble[name] then return preamble[name] end
  local ok, m = pcall(token.get_meaning, name)
  if ok then return m end
end

local function is_macro(name)
  local ok, t = pcall(token.create, name)
  return ok and t.cmdname ~= nil and t.cmdname:find("call") ~= nil
end

-- undefined or \relax counts as undefined, as LaTeX's \@ifundefined has it
local function defined_token(name)
  local ok, t = pcall(token.create, name)
  if not ok or not t then return nil end
  local cmd = t.cmdname
  if cmd == nil or cmd == "undefined_cs" or cmd == "relax" then return nil end
  return t
end

-- nil when undefined, else what the name means now
local function state(name)
  local t = defined_token(name)
  return t and (meaning(name) or (t.cmdname .. " " .. tostring(t.mode)))
end

-- a name mentioned in code enters the hash undefined, so being in it says nothing
local function defined_now()
  local set = {}
  for _, n in ipairs(tex.hashtokens()) do
    if defined_token(n) then set[n] = true end
  end
  return set
end

local function from_parameters(p)
  local rest = p:gsub("^%[#1%]", "")
  local s = {}
  if rest ~= p then s[1] = "o" end
  for _ = 1, select(2, rest:gsub("#%d", "")) do s[#s + 1] = "m" end
  -- \def\x#1#{: the last argument runs up to a brace, where an optional [..] goes, and the brace group follows
  if rest:sub(-1) == "{" and #s > 0 then
    s[#s] = "o"
    s[#s + 1] = "m"
  end
  return table.concat(s, " ")
end

-- the arguments of `name`; nil for a \NewDocumentCommand, which TeX is asked about separately
local function spec_of(name, depth)
  if not is_macro(name) then return "" end
  local m = meaning(name)
  if not m then return "" end
  local p = m:match("^(.-)%->") or ""
  local body = m:match("%->(.*)$") or ""
  if body:find("__cmd_start") or body:find("__xparse") then return nil end
  if p ~= "" then return from_parameters(p) end
  if depth >= 4 then return "" end
  -- \DeclareRobustCommand leaves \protect and the inner command, whose name ends in a space
  local robust = body:match("^\\protect \\([%a@]+) +$")
  if robust then return spec_of(robust .. " ", depth + 1) end
  -- \newcommand with an optional first argument; a robust one's inner names end in a space, printed as a second space
  local optional = body:match("^\\@protected@testopt \\[%a@]+ +\\\\([%a@]+ ?) ") or body:match("^\\@testopt \\\\([%a@]+ ?) ")
  if optional then
    local inner = (meaning("\\" .. optional) or ""):match("^(.-)%->")
    if inner then return from_parameters(inner) end
  end
  -- a command that checks for [ or * and hands off, or is only another command; s marks the star form
  local star = body:match("^\\@ifstar") or body:match("^\\kernel@ifstar")
  local target_name = body:match("^\\@ifnextchar %[%s*{?\\([%a@]+)")
    or body:match("^\\@testopt%s*{?\\([%a@]+)")
    or body:match("^\\@protected@testopt%s*{?\\([%a@]+)")
    or body:match("^\\kernel@ifnextchar %[%s*{?\\([%a@]+)")
    or body:match("^\\new@ifnextchar %[%s*{?\\([%a@]+)")
    or body:match("^\\@ifstar%s*{[^{}]*}%s*{\\csname ([%a@]+)\\endcsname")
    or body:match("^\\@ifstar%s*{[^{}]*}%s*{\\([%a@]+)")
    or body:match("^\\@ifstar%s*{?\\([%a@]+)")
    or body:match("^\\([%a@]+) ?$")
    or body:match("^\\[%a@]+ \\([%a@]+) ?$")
  -- or does some work first and dispatches at the very end (\Needspace)
  if not target_name then
    target_name = body:match("\\@ifstar%s*{\\[%a@]+ *}%s*{\\([%a@]+) *} *$")
    if target_name then star = true end
    target_name = target_name or body:match("\\@ifnextchar %[%s*{\\([%a@]+) *}%s*{[^{}]*} *$")
  end
  if target_name and target_name ~= name then
    local s = spec_of(target_name, depth + 1)
    if s and s ~= "" then return star and ("s " .. s) or s end
  end
  return star and "s" or ""
end

local function mark(n, letter)
  marks[n] = (marks[n] or "") .. letter
end

-- LaTeX's file hooks: what another package's file defines belongs to that package
function probe_file_open()
  local file = token.get_macro("CurrentFile") or ""
  local inside = reading[#reading] or false
  -- the package's own files carry its name (smartdiagramlibrarycore.commands.code.tex); anything else read while
  -- it loads (a TikZ library) or outside it (a driver at \begin{document}) belongs to another package
  local own = file == target or file:sub(1, #base) == base
  local other = inside or not own
  if other and not inside then dependency_before = defined_now() end
  reading[#reading + 1] = other
end

function probe_file_close()
  local other = table.remove(reading)
  if other and not (reading[#reading] or false) and dependency_before then
    for _, n in ipairs(tex.hashtokens()) do
      if not dependency_before[n] and defined_token(n) then mark(n, "d") end
    end
    dependency_before = nil
  end
end

function probe_before(name)
  base = name
  target = name .. ".sty"
  for _, n in ipairs(tex.hashtokens()) do before[n] = state(n) end
  if token.is_defined("AddToHook") then
    tex.sprint("\\AddToHook{begindocument/before}{\\directlua{probe_preamble_end()}}")
  end
end

function probe_preamble_end()
  for n in (token.get_macro("@preamblecmds") or ""):gmatch("\\do \\([%a@]+) ?") do
    local ok, m = pcall(token.get_meaning, n)
    if ok and m then
      preamble[n] = m
      if n:match("^%a+$") and m:find("__cmd_start") then
        tex.sprint("\\GetDocumentCommandArgSpec\\" .. n .. "\\directlua{probe_preamble_spec('" .. n .. "')}")
      end
    end
  end
end

function probe_preamble_spec(n)
  preamble_specs[n] = token.get_macro("ArgumentSpecification") or ""
end

function probe_after()
  for _, n in ipairs(tex.hashtokens()) do
    local b = before[n]
    local now = n:match("^%a+$") and state(n)
    -- new, or redefined by the package
    if now and b ~= now then
      if b ~= nil then mark(n, "r") end
      local s = spec_of(n, 0)
      if s == nil then document_commands[#document_commands + 1] = n else out[#out + 1] = n .. "\t" .. s .. "\t" .. (marks[n] or "") end
    end
  end
  for _, n in ipairs(document_commands) do
    if preamble_specs[n] then
      out[#out + 1] = n .. "\tX " .. preamble_specs[n] .. "\t" .. (marks[n] or "")
    else
      tex.sprint("\\GetDocumentCommandArgSpec\\" .. n .. "\\directlua{probe_spec('" .. n .. "')}")
    end
  end
  tex.sprint("\\directlua{probe_write()}")
end

function probe_spec(n)
  out[#out + 1] = n .. "\tX " .. (token.get_macro("ArgumentSpecification") or "") .. "\t" .. (marks[n] or "")
end

function probe_write()
  local f = io.open(tex.jobname .. ".probe", "wb")
  f:write(table.concat(out, "\n"), "\n")
  f:close()
end
