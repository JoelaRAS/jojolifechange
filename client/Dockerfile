FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install

FROM deps AS build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
COPY tsconfig.json tsconfig.base.json tsconfig.node.json vite.config.ts ./
COPY tailwind.config.ts postcss.config.cjs index.html ./
COPY src ./src
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 3000
CMD ["node", "server/index.js"]
