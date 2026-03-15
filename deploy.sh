#!/usr/bin/env bash
set -ex

rm -rf docs/*
for F in *.html  LICENSE aftertone.png
do
  cp "$F" ./docs/
done

for D in ./favicons ./js
do
  cp -r "$D" ./docs/
done

git add docs
git commit -m "Deploy"

echo About to push to `main` this makes the version in ./docs available on not-unplanned.github.io/
git push
