import { Request, Response } from 'express';
import { pool } from '../config/db';
import { uploadToGCP } from '../services/gcpStorage'; 

// ==================================================================
// XÁC MINH CHỦ SỞ HỮU (CLAIMS)
// ==================================================================

// Gửi yêu cầu xác minh
// API: POST /claims/submit
// Frontend: ClaimStoreModal.tsx
export const submitClaim = async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        // [AUTO-FIX DB 1] Sửa kiểu dữ liệu store_id thành VARCHAR
        try {
            await client.query("ALTER TABLE store_claims ALTER COLUMN store_id TYPE VARCHAR(255) USING store_id::VARCHAR");
        } catch (dbErr) {}

        // [AUTO-FIX DB 2] Xóa ràng buộc khóa ngoại (Foreign Key)
        try {
            await client.query("ALTER TABLE store_claims DROP CONSTRAINT IF EXISTS store_claims_store_id_fkey");
        } catch (dbErr) {}

        // [AUTO-FIX DB 3] Thêm cột images
        try {
            await client.query("ALTER TABLE store_claims ADD COLUMN IF NOT EXISTS images TEXT[]");
        } catch (dbErr) {}

        // [AUTO-FIX DB 4 - QUAN TRỌNG] Thêm các cột lưu Tọa độ & Địa chỉ
        // Để khi Admin duyệt, ta có dữ liệu chính xác để tạo Store
        try {
            await client.query(`
                ALTER TABLE store_claims 
                ADD COLUMN IF NOT EXISTS store_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS store_address TEXT,
                ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 7),
                ADD COLUMN IF NOT EXISTS lng DECIMAL(10, 7),
                ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
                ADD COLUMN IF NOT EXISTS email VARCHAR(255),
                ADD COLUMN IF NOT EXISTS role VARCHAR(50)
            `);
        } catch (dbErr) {}

        // Bắt đầu Transaction chính
        await client.query('BEGIN');

        const body = req.body;
        const userId = body.userId;
        const storeId = body.storeId; 
        
        // 1. Xử lý Upload ảnh
        const files = (req as any).files as Express.Multer.File[];
        let imageUrls: string[] = [];

        if (files && files.length > 0) {
            for (const file of files) {
                const url = await uploadToGCP(file);
                imageUrls.push(url);
            }
        }

        const mainImageUrl = imageUrls.length > 0 ? imageUrls[0] : '';
        
        // 2. Insert vào DB (Lưu đầy đủ Lat, Lng, Address)
        await client.query(
            `INSERT INTO store_claims 
             (user_id, store_id, message, image_url, images, status, created_at, 
              store_name, store_address, lat, lng, phone, email, role) 
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7, $8, $9, $10, $11, $12)`,
            [
                userId, storeId, body.message || '', mainImageUrl, imageUrls,
                body.storeName, body.storeAddress, 
                parseFloat(body.lat || 0), parseFloat(body.lng || 0), 
                body.phone, body.email, body.role
            ]
        );

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error("Submit Claim Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};