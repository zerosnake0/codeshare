set -ex

./node_modules/.bin/browserify \
    -p tinyify \
    -t browserify-css \
    -o static/dist/client.js \
    client.js

./node_modules/.bin/browserify \
    -p tinyify \
    -t browserify-css \
    -o static/dist/create.js \
    create.js

./node_modules/.bin/browserify \
    -p tinyify \
    -o build/server.js \
    --node \
    server.js