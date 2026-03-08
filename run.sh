#/bin/bash 

cd $(dirname $0)/..
(sleep 3 && open http://localhost:8000/aftertone/index.html?debug ) &
python3 -m http.server 8000 

