FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/template-service
COPY template-service/package*.json ./
RUN npm install --omit=dev

COPY template-service/ .

EXPOSE 3004

CMD ["node", "src/index.js"]
