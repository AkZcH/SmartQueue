FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod +x node_modules/.bin/ts-node
CMD ["npx", "ts-node", "src/index.ts"]