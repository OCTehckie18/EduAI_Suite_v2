FROM node:22-alpine

WORKDIR /app/edugames

COPY edugames/package*.json ./
RUN npm ci

COPY edugames .
COPY logo /app/logo

EXPOSE 5174

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]
