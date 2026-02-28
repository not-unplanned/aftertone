#!/usr/bin/env bash
set -e

rm -rf docs/*
for F in index.html *.ico *.png 
do
  cp "$F"./docs/
done

git add docs
git commit -m "Deploy"
git push
