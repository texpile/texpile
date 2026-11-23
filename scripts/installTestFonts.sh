#!/usr/bin/env bash
# the canvas specs measure text in Inter, the font the dev containers resolve system-ui to
set -euo pipefail
sudo apt-get install -y --no-install-recommends fonts-inter fonts-jetbrains-mono
sudo tee /etc/fonts/conf.d/56-prefer-inter.conf > /dev/null <<'CONF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <alias><family>system-ui</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>ui-sans-serif</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>-apple-system</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>BlinkMacSystemFont</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>SF Pro Text</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>SF Pro Display</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>Segoe UI</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>Helvetica Neue</family><prefer><family>Inter</family></prefer></alias>
  <alias><family>sans-serif</family><prefer><family>Inter</family></prefer></alias>
</fontconfig>
CONF
sudo fc-cache -f
fc-match system-ui
