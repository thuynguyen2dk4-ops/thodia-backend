const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // Cho phép Frontend (React) gọi vào
app.use(express.json());

// --- CẤU HÌNH KẾT NỐI DATABASE ---
const pool = new Pool({
  user: 'postgres',           // Tên đăng nhập mặc định
  host: '34.177.90.63',     // 👉 THAY CÁI PUBLIC IP BẠN VỪA COPY VÀO ĐÂY
  database: 'postgres',       // Tên database mặc định
  password: 'Thodiauni123@', // 👉 THAY MẬT KHẨU CLOUD SQL BẠN ĐÃ ĐẶT
  port: 5432,
  ssl: {
    rejectUnauthorized: false // <--- DÒNG QUAN TRỌNG MỚI THÊM
  }
});

// --- KIỂM TRA KẾT NỐI ---
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Lỗi kết nối Database:', err.stack);
  }
  console.log('✅ Đã kết nối thành công tới Google Cloud SQL!');
  release();
});

// --- API THỬ NGHIỆM: Lấy danh sách Stores ---
app.get('/api/stores', async (req, res) => {
  try {
    // Thử lấy dữ liệu từ bảng user_stores (hoặc bảng nào bạn nhớ tên)
    const result = await pool.query('SELECT * FROM user_stores LIMIT 5');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy dữ liệu' });
  }
});

// Chạy server tại cổng 8080
// Ưu tiên dùng cổng Google cấp, nếu không có thì dùng 8081 (để chạy ở nhà)
const PORT = process.env.PORT || 8081; 

app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});