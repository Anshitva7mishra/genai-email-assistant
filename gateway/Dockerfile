FROM node:20-alpine

WORKDIR /app

# Copy shared utilities first (referenced via relative path in container)
COPY shared/ ./shared/

# Install shared deps
WORKDIR /app/shared
RUN npm install --omit=dev

# Switch to service directory
WORKDIR /app/gateway
COPY gateway/package*.json ./
RUN npm install --omit=dev

COPY gateway/ .

EXPOSE 3001

CMD ["node", "src/index.js"]
