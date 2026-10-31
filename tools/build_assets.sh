#!/usr/bin/env bash
# A modellek előkészítése a mellékelt forrásfájlokból (Python: trimesh, fast-simplification, embreex, scipy).
# Használat: tools/build_assets.sh <forrás-könyvtár> (ahol a .glb/.stl fájlok vannak)
set -e
SRC=${1:-/mnt/user-data/attachments}; TMP=$(mktemp -d); cd "$(dirname "$0")"
python3 -I prep_stage_a.py $TMP/a_ponera.npz ponera $TMP && python3 -I prep_stage_b.py $TMP/a_ponera.npz ../assets/models/ponera.glb ponera
python3 -I prep_stage_a.py $TMP/a_cephalotes.npz cephalotes $TMP && python3 -I prep_stage_b.py $TMP/a_cephalotes.npz ../assets/models/cephalotes.glb cephalotes
python3 -I prep_stage_a.py $TMP/a_odonto.npz odonto $TMP && python3 -I prep_stage_b.py $TMP/a_odonto.npz ../assets/models/odonto.glb odonto
python3 -I prep_isopod.py $TMP/a_isopod.npz ../assets/models/isopod.glb
python3 -I prep_spider.py "$SRC"/*/c4217791-realistic_spider_3d_model.glb ../assets/models/spider.glb
