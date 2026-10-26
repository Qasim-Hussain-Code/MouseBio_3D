#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/npm.sh test
bash scripts/npm.sh run build
python3 scripts/test_geometry.py
python3 scripts/test_resources.py
python3 scripts/test_volume_assessment.py
python3 scripts/test_volume_geometry.py
python3 scripts/test_publication.py
python3 scripts/test_registered_anatomy.py
python3 scripts/test_release.py
python3 scripts/check_publication.py
python3 scripts/resource_usage.py
