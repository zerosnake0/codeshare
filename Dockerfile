ARG IMAGE=node:14.3.0-alpine3.11

FROM ${IMAGE} as build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY . .

RUN sh ./build.sh

FROM ${IMAGE}

WORKDIR /app

COPY --from=build /app/static /app/static

COPY --from=build /app/build/server.js /app/server.js

CMD ["node", "server.js"]
