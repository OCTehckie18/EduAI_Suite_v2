FROM node:22-alpine

WORKDIR /app/eduai

COPY eduai/package*.json ./
RUN npm ci

COPY eduai .
COPY logo /app/logo

EXPOSE 5175

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5175"]
