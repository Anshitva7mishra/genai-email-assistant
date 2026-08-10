FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/ai-service
COPY ai-service/package*.json ./
RUN npm install --omit=dev

COPY ai-service/ .

EXPOSE 3002

CMD ["node", "src/index.js"]
