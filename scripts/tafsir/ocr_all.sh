#!/bin/sh
# Windows OCR over every page folder, three at a time
D="$(cd "$(dirname "$0")" && pwd -W)"
run() { for v in "$@"; do powershell -NoProfile -ExecutionPolicy Bypass -File "$D/ocr.ps1" -Dir "$D/pages/v$v"; echo "ocr v$v done"; done; }
run 1 4 7 10 &
run 2 5 8 &
run 3 6 9 &
wait
echo all done
