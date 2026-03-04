#!/usr/bin/env bash
set -ex

rm -rf docs/*
for F in *.html *.ico *.png LICENSE
do
  cp "$F" ./docs/
done

cp ./favicons ./docs/ 

git add docs
git commit -m "Deploy"
git push
