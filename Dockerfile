FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

COPY package*.json ./

RUN pnpm install

COPY . .

RUN pnpm build

EXPOSE 3001

CMD ["pnpm", "start:prod"]