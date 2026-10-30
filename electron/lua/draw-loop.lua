-- the figure engine's loop: one picture per request on stdin, its result in work/result.json, a marker when written
local DONE = "@@TEXPILE_DRAW_DONE"

function draw_step()
	local line = io.stdin:read("*l")
	if not line or line == "quit" then
		tex.print("\\global\\drawrun=0 ")
		return
	end
	os.remove("work/result.json")
	tex.print("\\webtexpicture{work/picture}\\directlua{draw_done()}")
end

function draw_done()
	io.stdout:write("\n" .. DONE .. "\n")
	io.stdout:flush()
end
