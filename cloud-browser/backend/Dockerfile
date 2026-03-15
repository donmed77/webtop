FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ curl && \
    curl -fsSL https://get.docker.com | sh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

EXPOSE 3005

CMD ["node", "dist/main.js"]
