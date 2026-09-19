# Production image for the React/Vite frontend — builds the static bundle,
# then serves it with nginx, which also reverse-proxies /api and /media to
# the backend container. That puts everything on one origin in production,
# so the app needs no CORS configuration and no VITE_API_URL — same as how
# the Vite dev server's own proxy (vite.config.js) already works.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
