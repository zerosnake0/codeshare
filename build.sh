set -ex

sh ./build_client.sh

./node_modules/.bin/browserify \
    -o build/server.js \
    --node \
    server.js