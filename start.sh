#!/usr/bin/env bash
# Κτῆμα ἐς Ἀεί — 이 폴더를 띄운다 (mac / Linux)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js 가 없습니다."
  echo "  https://nodejs.org 에서 LTS 를 받아 설치한 뒤 다시 실행하세요."
  echo
  exit 1
fi

exec node serve.mjs --open "$@"
