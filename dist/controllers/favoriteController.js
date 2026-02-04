"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFavoriteById = exports.toggleFavorite = exports.getFavorites = void 0;
const db_1 = require("../config/db");
// Hàm làm sạch ID (chuyển "user-store-12" -> "12")
const cleanId = (id) => {
    if (!id)
        return null;
    const strId = String(id);
    if (strId.includes('user-store-')) {
        return strId.replace('user-store-', '');
    }
    return strId;
};
// ==================================================================
// QUẢN LÝ YÊU THÍCH (FAVORITES)
// ==================================================================
// 1. Lấy danh sách Yêu thích của User (Đã map field cho Frontend)
// API: GET /api/favorites?userId=...
const getFavorites = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId)
            return res.status(400).json({ error: "Thiếu userId" });
        // [AUTO-FIX DB] Đảm bảo bảng tồn tại và có cột created_at
        try {
            await db_1.pool.query(`
                CREATE TABLE IF NOT EXISTS user_favorites (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255),
                    store_id INT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, store_id)
                )
            `);
            // Add column if missing (for existing tables)
            await db_1.pool.query("ALTER TABLE user_favorites ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        }
        catch (e) { }
        // Join bảng favorites với user_stores
        const result = await db_1.pool.query(`SELECT 
                s.*, 
                f.id as favorite_id,
                f.created_at as fav_created_at
             FROM user_favorites f
             JOIN user_stores s ON CAST(f.store_id AS TEXT) = CAST(s.id AS TEXT)
             WHERE f.user_id = $1
             ORDER BY f.created_at DESC`, [userId]);
        // [FIX QUAN TRỌNG] Map dữ liệu sang format mà FavoritesPanel.tsx mong đợi (location_*)
        const mappedRows = result.rows.map(row => ({
            ...row,
            // Các trường Frontend cần:
            location_id: `user-store-${row.id}`,
            location_name: row.name_vi,
            location_name_en: row.name_en,
            location_lat: parseFloat(row.lat),
            location_lng: parseFloat(row.lng),
            location_type: row.category,
            location_image: row.image_url
        }));
        res.json(mappedRows);
    }
    catch (err) {
        console.error("Get Favorites Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getFavorites = getFavorites;
// 2. Toggle Yêu thích (Thêm/Xóa)
// API: POST /api/favorites
const toggleFavorite = async (req, res) => {
    try {
        const { userId, storeId, locationId } = req.body;
        // Lấy ID chuẩn (ưu tiên storeId, nếu không có thì lấy locationId và clean)
        const rawId = storeId || locationId;
        const finalStoreId = cleanId(rawId);
        if (!finalStoreId)
            return res.status(400).json({ error: "Thiếu Store ID" });
        // [AUTO-FIX DB]
        try {
            await db_1.pool.query(`
                CREATE TABLE IF NOT EXISTS user_favorites (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255),
                    store_id INT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, store_id)
                )
            `);
            await db_1.pool.query("ALTER TABLE user_favorites ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        }
        catch (e) { }
        // Kiểm tra xem đã like chưa
        const check = await db_1.pool.query('SELECT * FROM user_favorites WHERE user_id = $1 AND store_id = $2', [userId, finalStoreId]);
        if (check.rows.length > 0) {
            // Đã tồn tại -> Xóa (Unlike)
            await db_1.pool.query('DELETE FROM user_favorites WHERE user_id = $1 AND store_id = $2', [userId, finalStoreId]);
            res.json({ isFavorite: false, message: "Đã xóa khỏi danh sách yêu thích" });
        }
        else {
            // Chưa tồn tại -> Thêm (Like)
            await db_1.pool.query('INSERT INTO user_favorites (user_id, store_id, created_at) VALUES ($1, $2, NOW())', [userId, finalStoreId]);
            res.json({ isFavorite: true, message: "Đã thêm vào danh sách yêu thích" });
        }
    }
    catch (err) {
        console.error("Toggle Favorite Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.toggleFavorite = toggleFavorite;
// 3. Xóa Yêu thích theo ID (Dùng cho nút xóa trong Panel)
// API: DELETE /api/favorites/:id
const removeFavoriteById = async (req, res) => {
    try {
        const { id } = req.params; // ID gửi lên có thể là "user-store-123"
        const { userId } = req.body;
        const finalStoreId = cleanId(id);
        if (!finalStoreId || !userId)
            return res.status(400).json({ error: "Thiếu thông tin" });
        await db_1.pool.query('DELETE FROM user_favorites WHERE user_id = $1 AND store_id = $2', [userId, finalStoreId]);
        res.json({ success: true, message: "Đã xóa thành công" });
    }
    catch (err) {
        console.error("Remove Favorite Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.removeFavoriteById = removeFavoriteById;
