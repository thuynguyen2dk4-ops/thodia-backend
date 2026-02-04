import { Request, Response } from 'express';
import { pool } from '../config/db';

// ==================================================================
// PHẦN 1: PUBLIC (Hiển thị tin tuyển dụng)
// ==================================================================

// Lấy danh sách việc làm đã duyệt
// API: GET /api/jobs/approved
// Frontend: JobsPage.tsx
export const getJobsPublic = async (req: Request, res: Response) => {
    try {
        // [AUTO-FIX DB] Đảm bảo các cột cần thiết tồn tại
        try {
            await pool.query("ALTER TABLE recruitment_posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Part-time'");
            await pool.query("ALTER TABLE recruitment_posts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");
        } catch (e) {}

        // [FIX JOIN] Sử dụng CAST để tránh lỗi lệch kiểu dữ liệu (Integer vs Text) khi JOIN
        // Ưu tiên hiển thị sđt riêng của Job, nếu không có thì lấy sđt của Store
        const query = `
            SELECT 
                j.id, j.store_id, j.title, j.description, j.salary, j.status, j.created_at, j.type,
                COALESCE(j.phone, s.phone) as phone, -- Lấy sđt job, nếu null lấy sđt store
                s.name_vi as shop_name, 
                s.address_vi as address, 
                s.image_url as shop_image
            FROM recruitment_posts j 
            JOIN user_stores s ON CAST(j.store_id AS TEXT) = CAST(s.id AS TEXT) 
            WHERE j.status = 'approved' 
            ORDER BY j.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// ==================================================================
// PHẦN 2: USER (Đăng tin)
// ==================================================================

// Tạo tin tuyển dụng mới
// API: POST /api/jobs
// Frontend: JobsPage.tsx (handlePostJob)
export const createJob = async (req: Request, res: Response) => {
    try {
        // [AUTO-FIX DB]
        try {
            await pool.query("ALTER TABLE recruitment_posts ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Part-time'");
            await pool.query("ALTER TABLE recruitment_posts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");
        } catch (dbErr) {
            console.warn("Auto-fix DB warning:", dbErr);
        }

        const { title, salary, type, description, user_id, phone } = req.body;
        
        // 1. Tìm Store của User
        const storeCheck = await pool.query(
            'SELECT id, phone FROM user_stores WHERE user_id = $1 LIMIT 1',
            [user_id]
        );

        if (storeCheck.rows.length === 0) {
            return res.status(400).json({ 
                error: "Bạn chưa có cửa hàng trên hệ thống. Vui lòng tạo cửa hàng trước khi đăng tin tuyển dụng." 
            });
        }

        const storeId = storeCheck.rows[0].id;
        const storePhone = storeCheck.rows[0].phone;

        // 2. Insert tin tuyển dụng
        // Nếu user không nhập sđt riêng, dùng sđt của cửa hàng
        const finalPhone = phone || storePhone;

        await pool.query(
            `INSERT INTO recruitment_posts 
            (store_id, title, description, salary, status, type, phone) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                storeId, 
                title, 
                description, 
                salary, 
                'pending', // Mặc định chờ duyệt
                type || 'Part-time',
                finalPhone 
            ]
        );

        res.json({ success: true, message: "Đã gửi tin tuyển dụng, vui lòng chờ duyệt." });

    } catch (err: any) {
        console.error("Lỗi đăng tin:", err);
        res.status(500).json({ error: err.message });
    }
};