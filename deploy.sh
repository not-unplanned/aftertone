#!/usr/bin/env bash
set -ex

rm -rf docs/*
for F in *.html  LICENSE
do
  cp "$F" ./docs/
done

cp -r ./favicons ./docs/ 

git add docs
git commit -m "Deploy"
git push
