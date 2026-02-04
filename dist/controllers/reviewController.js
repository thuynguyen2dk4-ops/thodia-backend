"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteReview = exports.addReview = exports.getReviews = void 0;
const db_1 = require("../config/db");
// ==================================================================
// QUẢN LÝ ĐÁNH GIÁ (REVIEWS)
// ==================================================================
// 1. Lấy danh sách đánh giá của 1 cửa hàng
// API: GET /api/reviews/list/:storeId
const getReviews = async (req, res) => {
    try {
        const { storeId } = req.params;
        // [AUTO-FIX DB] Đảm bảo bảng store_reviews và profiles có đủ cột
        try {
            // Fix bảng review
            await db_1.pool.query("ALTER TABLE store_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
            // Fix bảng profiles (Thêm full_name nếu thiếu để tránh lỗi JOIN)
            await db_1.pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)");
            await db_1.pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT");
        }
        catch (e) {
            console.warn("Auto-fix DB warning:", e);
        }
        // Join với bảng profiles để lấy tên và avatar người review
        // [FIX] Dùng CAST(r.store_id AS TEXT) để tránh lỗi so sánh integer = text
        // Sử dụng COALESCE để nếu full_name null thì lấy email (hoặc chuỗi 'Người dùng')
        const query = `
            SELECT 
                r.*, 
                p.email, 
                COALESCE(p.full_name, p.email, 'Người dùng ẩn danh') as full_name,
                p.avatar_url 
            FROM store_reviews r
            LEFT JOIN profiles p ON r.user_id = p.id
            WHERE CAST(r.store_id AS TEXT) = $1
            ORDER BY r.created_at DESC
        `;
        const result = await db_1.pool.query(query, [String(storeId)]);
        res.json(result.rows);
    }
    catch (err) {
        console.error("Get Reviews Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getReviews = getReviews;
// 2. Thêm đánh giá mới
// API: POST /api/reviews
const addReview = async (req, res) => {
    console.log("👉 [DEBUG] Đang thêm Review:", req.body);
    try {
        // [AUTO-FIX DB] Tự động tạo bảng hoặc thêm cột nếu thiếu
        try {
            await db_1.pool.query(`
                CREATE TABLE IF NOT EXISTS store_reviews (
                    id SERIAL PRIMARY KEY,
                    store_id INT,
                    user_id VARCHAR(255),
                    rating INT,
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);
            await db_1.pool.query("ALTER TABLE store_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        }
        catch (e) { }
        const { storeId, userId, rating, comment } = req.body;
        if (!storeId || !userId || !rating) {
            return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
        }
        // Insert review
        // [FIX] Chủ động thêm created_at = NOW()
        await db_1.pool.query(`INSERT INTO store_reviews (store_id, user_id, rating, comment, created_at) 
             VALUES ($1, $2, $3, $4, NOW())`, [storeId, userId, rating, comment]);
        // (Optional) Tính lại điểm trung bình cho Store ngay lập tức
        try {
            // Tính toán rating mới
            const avgResult = await db_1.pool.query(`SELECT AVG(rating) as avg_rating, COUNT(*) as count 
                 FROM store_reviews 
                 WHERE CAST(store_id AS TEXT) = $1`, [String(storeId)]);
            const { avg_rating, count } = avgResult.rows[0];
            // Cập nhật vào bảng user_stores (nếu bảng này có cột rating_avg)
            // Dùng try-catch lồng để tránh lỗi nếu bảng user_stores thiếu cột
            try {
                await db_1.pool.query("ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS rating_avg DECIMAL(3, 2) DEFAULT 0");
                await db_1.pool.query("ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0");
                await db_1.pool.query(`UPDATE user_stores 
                     SET rating_avg = $1, review_count = $2 
                     WHERE CAST(id AS TEXT) = $3`, [Number(avg_rating || 0).toFixed(1), count || 0, String(storeId)]);
            }
            catch (updateErr) {
                console.warn("Không thể update rating vào user_stores:", updateErr);
            }
        }
        catch (e) {
            console.warn("Lỗi tính toán rating:", e);
        }
        res.json({ success: true, message: "Đã gửi đánh giá thành công" });
    }
    catch (err) {
        console.error("Add Review Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.addReview = addReview;
// 3. Xóa đánh giá
// API: DELETE /api/reviews/:id
const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.pool.query('DELETE FROM store_reviews WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteReview = deleteReview;
