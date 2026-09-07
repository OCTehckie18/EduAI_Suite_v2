FROM node:22-alpine

WORKDIR /app/teacherbuddy

COPY teacherbuddy/package*.json ./
RUN npm ci --legacy-peer-deps

COPY teacherbuddy .
COPY logo /app/logo

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
