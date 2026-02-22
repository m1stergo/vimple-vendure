FROM node:22 AS build

WORKDIR /usr/src/app

ARG VENDURE_API_HOST=http://localhost
ARG VENDURE_API_PORT=3000
ENV VENDURE_API_HOST=${VENDURE_API_HOST}
ENV VENDURE_API_PORT=${VENDURE_API_PORT}

COPY package.json ./
COPY package-lock.json ./
COPY .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:dashboard

FROM node:22 AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json ./
COPY package-lock.json ./
COPY .npmrc ./
RUN npm ci --omit=dev

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/static ./static

CMD ["npm", "run", "start:server"]
