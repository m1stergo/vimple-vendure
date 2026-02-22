FROM node:22 AS build

WORKDIR /usr/src/app

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
