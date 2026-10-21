#!/bin/sh
# The Content studio → Templates tab's preview pictures: one still per template,
# from tools/previews/<id>.json (its "frame" = the moment shown), saved small
# to ../public/templates/<id>.jpg. Run from dispatch/motion after a template
# changes:  sh tools/make_previews.sh [id ...]
set -e
out=../public/templates
mkdir -p "$out" out
ids=${*:-$(ls tools/previews | sed 's/\.json$//')}
for id in $ids; do
  frame=$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['frame'])" "tools/previews/$id.json")
  gl=""; [ "$id" = "spotlight" ] && gl="--gl=swangle"  # 3D draws with WebGL, in software here
  npx remotion still src/index.jsx MotionPost "out/preview-$id.png" --props="tools/previews/$id.json" --frame="$frame" --log=error $gl
  python -c "
from PIL import Image; import sys
im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((432,768)); im.save(sys.argv[2],'JPEG',quality=82,optimize=True)" "out/preview-$id.png" "$out/$id.jpg"
  echo "$out/$id.jpg"
done
