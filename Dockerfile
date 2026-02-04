# Bước 1: Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy các file cấu hình package
COPY package*.json ./
COPY tsconfig.json ./

# Cài đặt dependencies
RUN npm install

# Copy toàn bộ code vào container
COPY . .

# Biên dịch TypeScript sang JavaScript
RUN npm run build

# Bước 2: Production stage
FROM node:18-slim

WORKDIR /app

# Copy package.json và cài đặt chỉ production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy file đã build từ builder stage
COPY --from=builder /app/dist ./dist

# Copy file key GCP (Quan trọng để xác thực Storage)
COPY service-account-key.json ./service-account-key.json

# Cloud Run yêu cầu ứng dụng lắng nghe trên biến môi trường PORT
ENV PORT=8080

# Chạy server
CMD ["node", "dist/server.js"]