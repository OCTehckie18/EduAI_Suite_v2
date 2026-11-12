FROM node:22-alpine

WORKDIR /app/landing

COPY landing/package*.json ./
RUN npm ci

COPY landing .
COPY shared /app/shared

EXPOSE 5176

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5176"]
