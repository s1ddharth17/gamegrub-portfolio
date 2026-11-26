FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_ROOT_URL=http://localhost:3001
ENV VITE_API_ROOT_URL=${VITE_API_ROOT_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=18 --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
