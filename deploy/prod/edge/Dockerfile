# The edge: builds the four portals and serves them with nginx, which also routes /api, /ws and /uploads to the backend.
# Build context is ./apps, plus this folder as the named context "edgeconf" (see docker-compose.prod.yml). Settings that must be known at build time are build arguments.

FROM node:22-alpine AS build-landing
WORKDIR /app/landing
COPY landing/package*.json ./
RUN npm ci
COPY landing .
COPY logo /app/logo
ARG VITE_EDUGAMES_URL
ARG VITE_TEACHERBUDDY_URL
ARG VITE_ADMIN_URL
RUN npm run build

FROM node:22-alpine AS build-eduai
WORKDIR /app/eduai
COPY eduai/package*.json ./
RUN npm ci
COPY eduai .
COPY logo /app/logo
RUN npm run build

FROM node:22-alpine AS build-teacherbuddy
WORKDIR /app/teacherbuddy
COPY teacherbuddy/package*.json ./
RUN npm ci
COPY teacherbuddy .
COPY logo /app/logo
ARG VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM node:22-alpine AS build-edugames
WORKDIR /app/edugames
COPY edugames/package*.json ./
RUN npm ci
COPY edugames .
COPY logo /app/logo
ARG VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=build-landing /app/landing/dist /srv/landing
COPY --from=build-eduai /app/eduai/dist /srv/admin
COPY --from=build-teacherbuddy /app/teacherbuddy/dist /srv/teacher
COPY --from=build-edugames /app/edugames/dist /srv/student
# The nginx files sit next to this Dockerfile; compose passes that folder as the extra build context "edgeconf".
COPY --from=edgeconf nginx.conf /etc/nginx/nginx.conf
COPY --from=edgeconf app.conf /etc/nginx/snippets/app.conf
COPY --from=edgeconf sites.conf.template /etc/nginx/templates/sites.conf.template
EXPOSE 80
