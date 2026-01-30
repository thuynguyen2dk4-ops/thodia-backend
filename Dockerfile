# Sử dụng Node.js phiên bản 18 đầy đủ (không dùng slim để tránh thiếu đồ)
FROM node:18

# Tạo thư mục làm việc
WORKDIR /app

# CHỈ COPY đúng 1 file này thôi (Bỏ qua package-lock.json)
COPY package.json ./

# Cài đặt thư viện mới tinh (đảm bảo sạch 100%)
RUN npm install

# Copy toàn bộ code vào
COPY . .

# Mở cổng
EXPOSE 8080

# Chạy server
CMD ["node", "server.js"]