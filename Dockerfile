# Backend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* npm-shrinkwrap.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Expose and run
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
