import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';
import { pool } from './config/db'; // Đảm bảo đã import pool
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Tìm dòng app.use(cors()); và sửa thành:
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:5173','http://localhost:8082','http://thodiauni.space'], // Cho phép cả cổng 8081
  credentials: true 
}));
// Thêm đoạn này để xem log mỗi khi có request tới
app.use((req, res, next) => {
    console.log(`📡 Request đến: ${req.method} ${req.url}`);
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);

// Root
app.get('/', (req, res) => {
  res.send('ThodiaUni Backend is running...');
});
pool.connect()
  .then(() => console.log('✅ Đã kết nối Database thành công!'))
  .catch((err) => console.error('❌ Lỗi kết nối Database:', err.message));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});