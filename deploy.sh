#!/usr/bin/env bash
set -ex

rm -rf docs/*
for F in index.html *.ico *.png LICENSE
do
  cp "$F" ./docs/
done

git add docs
git commit -m "Deploy"
git push
