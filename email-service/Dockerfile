FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/email-service
COPY email-service/package*.json ./
RUN npm install --omit=dev

COPY email-service/ .

EXPOSE 3003

CMD ["node", "src/index.js"]
