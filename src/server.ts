import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import apiRoutes from './routes/api';

// Load biến môi trường
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- CẤU HÌNH CORS (QUAN TRỌNG) ---
// Cho phép Frontend (thodiauni.space) gọi vào Backend này
app.use(cors({
    origin: '*', // Cho phép tất cả các domain (Dùng cái này để fix nhanh lỗi CORS)
    // Nếu muốn bảo mật hơn sau này, hãy dùng: 
    // origin: ['https://www.thodiauni.space', 'https://thodiauni.space', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true 
}));

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// Cấu hình phục vụ file tĩnh (ảnh uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api', apiRoutes);

// Route kiểm tra serve sống hay chết
app.get('/', (req, res) => {
    res.send('🚀 Thodia Backend is running successfully!');
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`========================================\n`);
});