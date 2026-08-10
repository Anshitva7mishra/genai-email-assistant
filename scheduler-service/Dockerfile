FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/scheduler-service
COPY scheduler-service/package*.json ./
RUN npm install --omit=dev

COPY scheduler-service/ .

EXPOSE 3005

CMD ["node", "src/index.js"]
