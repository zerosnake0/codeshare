set -ex

./node_modules/.bin/browserify \
    -t browserify-css \
    -o static/dist/client.js \
    client.js

./node_modules/.bin/browserify \
    -t browserify-css \
    -o static/dist/create.js \
    create.js
