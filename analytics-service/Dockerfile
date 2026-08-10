FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/analytics-service
COPY analytics-service/package*.json ./
RUN npm install --omit=dev

COPY analytics-service/ .

EXPOSE 3006

CMD ["node", "src/index.js"]
