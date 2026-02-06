"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const api_1 = __importDefault(require("./routes/api"));
// Load biến môi trường
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// --- CẤU HÌNH CORS (QUAN TRỌNG) ---
// Cho phép Frontend (thodiauni.space) gọi vào Backend này
app.use((0, cors_1.default)({
    origin: '*', // Cho phép tất cả các domain (Dùng cái này để fix nhanh lỗi CORS)
    // Nếu muốn bảo mật hơn sau này, hãy dùng: 
    // origin: ['https://www.thodiauni.space', 'https://thodiauni.space', 'http://localhost:8081'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Cấu hình phục vụ file tĩnh (ảnh uploads)
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Routes
app.use('/api', api_1.default);
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
