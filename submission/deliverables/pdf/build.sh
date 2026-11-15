#!/bin/sh
# Builds standalone PDFs of the deliverables with absolute links (pandoc + headless Chrome).
# Usage: submission/deliverables/pdf/build.sh [document.md ...]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
docs=$(dirname "$here")
chrome=${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
[ $# -gt 0 ] || set -- technical-note.md modis-viirs-harmonization-literature-review.md third-party-rights.md software-licenses.md

for name in "$@"; do
  base=$(basename "$name" .md)
  title=$(sed -n '1s/^# //p' "$docs/$base.md")
  LINKS_JSON="$here/links.json" pandoc "$docs/$base.md" \
    --from gfm+tex_math_dollars --to html5 --standalone --math-method=mathml \
    --lua-filter "$here/absolute-links.lua" \
    --css "$here/print.css" --embed-resources \
    --metadata pagetitle="$title" --metadata lang=en \
    --include-after-body "$here/mermaid.html" \
    --output "$tmp/$base.html"
  "$chrome" --headless=new --disable-gpu --no-pdf-header-footer \
    --virtual-time-budget=20000 --run-all-compositor-stages-before-draw \
    --print-to-pdf="$docs/$base.pdf" "file://$tmp/$base.html" 2>/dev/null
  echo "$docs/$base.pdf"
done
