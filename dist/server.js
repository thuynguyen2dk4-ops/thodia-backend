"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = __importDefault(require("./routes/api"));
const db_1 = require("./config/db"); // Đảm bảo đã import pool
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
// Tìm dòng app.use(cors()); và sửa thành:
app.use((0, cors_1.default)({
    origin: ['http://localhost:8081', 'http://localhost:5173', 'http://localhost:8082', 'http://thodiauni.space'], // Cho phép cả cổng 8081
    credentials: true
}));
// Thêm đoạn này để xem log mỗi khi có request tới
app.use((req, res, next) => {
    console.log(`📡 Request đến: ${req.method} ${req.url}`);
    next();
});
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Routes
app.use('/api', api_1.default);
// Root
app.get('/', (req, res) => {
    res.send('ThodiaUni Backend is running...');
});
db_1.pool.connect()
    .then(() => console.log('✅ Đã kết nối Database thành công!'))
    .catch((err) => console.error('❌ Lỗi kết nối Database:', err.message));
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
