import { Request, Response } from 'express';
import { pool } from '../config/db';

// Hàm hỗ trợ: Làm sạch ID (chuyển "user-store-12" -> "12")
const cleanId = (id: string | number) => {
    if (!id) return null;
    const strId = String(id);
    if (strId.includes('user-store-')) {
        return strId.replace('user-store-', '');
    }
    return strId;
};

// ==================================================================
// PHẦN 1: PUBLIC & USER
// ==================================================================

// 1. Lấy danh sách Voucher đang hoạt động (Active)
export const getActiveVouchers = async (req: Request, res: Response) => {
    console.log("👉 [DEBUG] Đang lấy danh sách Voucher Banner (Active)...");
    try {
        // [AUTO-FIX DB] Đảm bảo bảng có cột created_at
        try {
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        } catch (e) {}

        // [FIX SQL] Chọn cột rõ ràng và ép kiểu ID để tránh lỗi JOIN
        const query = `
            SELECT 
                v.id, 
                v.code, 
                v.title_vi as title, 
                v.discount_value, 
                v.discount_type, 
                v.end_date,
                v.created_at,
                
                -- Thông tin Store
                s.id as store_id,
                s.name_vi as store_name, 
                s.address_vi, 
                s.lat, 
                s.lng, 
                s.image_url as store_image

            FROM store_vouchers v
            -- [QUAN TRỌNG] Ép kiểu sang TEXT để so sánh được bất kể store_id là số hay chữ
            JOIN user_stores s ON CAST(v.store_id AS TEXT) = CAST(s.id AS TEXT)
            
            WHERE v.is_active = true 
            AND (v.end_date IS NULL OR v.end_date >= CURRENT_DATE)
            AND s.status = 'approved'
            ORDER BY v.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        console.log(`✅ [DEBUG] Tìm thấy ${result.rows.length} voucher.`);
        if (result.rows.length > 0) {
            console.log("🔍 [DEBUG] Mẫu dữ liệu đầu tiên:", result.rows[0]);
        }

        // [FIX FORMAT] Format lại dữ liệu chuẩn chỉnh cho Frontend
        const formattedRows = result.rows.map(row => ({
            id: row.id,
            code: row.code,
            title: row.title || "Voucher",
            discount_value: Number(row.discount_value), // Đảm bảo là số
            discount_type: row.discount_type,
            end_date: row.end_date,
            
            store_id: row.store_id,
            store_name: row.store_name || "Cửa hàng",
            store_image: row.store_image,
            address_vi: row.address_vi || "Đang cập nhật",
            
            // Ép kiểu tọa độ an toàn (tránh null gây lỗi tính khoảng cách)
            lat: row.lat ? parseFloat(row.lat) : 0,
            lng: row.lng ? parseFloat(row.lng) : 0,
            
            location_id: `user-store-${row.store_id}`
        }));

        res.json(formattedRows);
    } catch (err: any) {
        console.error("❌ Get Active Vouchers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 2. Lưu Voucher vào ví người dùng
export const saveUserVoucher = async (req: Request, res: Response) => {
    console.log("👉 [DEBUG] Đang lưu voucher:", req.body);
    try {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_saved_vouchers (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) REFERENCES profiles(id) ON DELETE CASCADE,
                    voucher_id INT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, voucher_id)
                )
            `);
            await pool.query("ALTER TABLE user_saved_vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
            await pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()");
        } catch (e) {}

        const { userId, voucherId } = req.body;

        if (!userId || !voucherId) return res.status(400).json({ error: "Thiếu thông tin" });

        // Đảm bảo user tồn tại
        const userCheck = await pool.query('SELECT id FROM profiles WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            await pool.query(
                `INSERT INTO profiles (id, email, full_name, created_at, updated_at) 
                 VALUES ($1, $2, $3, NOW(), NOW())`,
                [userId, `${userId}@example.com`, 'New User'] 
            );
        }

        // Kiểm tra trùng
        const check = await pool.query(
            'SELECT id FROM user_saved_vouchers WHERE user_id = $1 AND voucher_id = $2',
            [userId, voucherId]
        );

        if (check.rows.length > 0) return res.status(400).json({ message: "Đã lưu trước đó" });

        await pool.query(
            'INSERT INTO user_saved_vouchers (user_id, voucher_id, created_at) VALUES ($1, $2, NOW())',
            [userId, voucherId]
        );

        res.json({ success: true, message: "Đã lưu voucher" });
    } catch (err: any) {
        console.error("Save User Voucher Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 3. Lấy ví Voucher
export const getUserVouchers = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: "Thiếu userId" });

        try {
            await pool.query("ALTER TABLE user_saved_vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        } catch (e) {}

        const query = `
            SELECT 
                sv.id as saved_id,
                v.id,
                v.code,
                v.title_vi as title,
                v.discount_value,
                v.discount_type,
                v.end_date,
                s.id as store_id,
                s.name_vi as store_name, 
                s.address_vi, 
                s.lat,
                s.lng,
                s.image_url
            FROM user_saved_vouchers sv
            JOIN store_vouchers v ON sv.voucher_id = v.id
            JOIN user_stores s ON CAST(v.store_id AS TEXT) = CAST(s.id AS TEXT)
            WHERE sv.user_id = $1
            ORDER BY sv.created_at DESC
        `;
        const result = await pool.query(query, [userId]);

        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: row.lat ? parseFloat(row.lat) : 0,
            lng: row.lng ? parseFloat(row.lng) : 0,
            location_id: `user-store-${row.store_id}`
        }));

        res.json(formattedRows);
    } catch (err: any) {
        console.error("Get User Vouchers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const removeUserVoucher = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM user_saved_vouchers WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};


// ==================================================================
// PHẦN 2: QUẢN LÝ VOUCHER (STORE OWNER)
// ==================================================================

// 5. Lấy danh sách Voucher của Store
export const getStoreVouchers = async (req: Request, res: Response) => {
    try {
        const { storeId } = req.params;
        const cleanStoreId = cleanId(storeId);
        
        try {
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        } catch (e) {}

        const result = await pool.query(
            `SELECT *, 
                    title_vi as title, 
                    discount_value as discount,
                    discount_value as discount_amount,
                    discount_type as type
             FROM store_vouchers 
             WHERE CAST(store_id AS TEXT) = $1 
             ORDER BY created_at DESC`, 
            [String(cleanStoreId)]
        );
        
        res.json(result.rows);
    } catch (err: any) {
        console.error("Get Vouchers Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 6. Tạo Voucher mới
export const createVoucher = async (req: Request, res: Response) => {
    try {
        try {
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS title_vi VARCHAR(255)");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'amount'");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12, 2)");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS min_order DECIMAL(12, 2) DEFAULT 0");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS max_uses INT DEFAULT 100");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS start_date TIMESTAMP DEFAULT NOW()");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE");
            await pool.query("ALTER TABLE store_vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        } catch (dbErr) {}

        const { 
            storeId, code, title_vi, discount_type, discount_value, 
            min_order, max_uses, start_date, end_date, is_active 
        } = req.body;

        const rawStoreId = storeId || req.body.store_id;
        const finalStoreId = cleanId(rawStoreId);
        
        const finalDiscountValue = discount_value || req.body.discount || 0;
        const finalTitle = title_vi || `Voucher ${code}`;

        await pool.query(
            `INSERT INTO store_vouchers 
            (store_id, code, title_vi, discount_type, discount_value, min_order, max_uses, start_date, end_date, is_active, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
            [
                finalStoreId, 
                code?.toUpperCase(), 
                finalTitle, 
                discount_type || 'amount', 
                finalDiscountValue, 
                min_order || 0, 
                max_uses || 100, 
                start_date || new Date(), 
                end_date, 
                is_active !== undefined ? is_active : true
            ]
        );
        res.json({ success: true });
    } catch (err: any) {
        console.error("Create Voucher Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 7. Cập nhật Voucher
export const updateVoucher = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { code, title_vi, discount_type, discount_value, min_order, max_uses, start_date, end_date, is_active } = req.body;

        await pool.query(
            `UPDATE store_vouchers 
             SET code=$1, title_vi=$2, discount_type=$3, discount_value=$4, 
                 min_order=$5, max_uses=$6, start_date=$7, end_date=$8, is_active=$9
             WHERE id=$10`,
            [code?.toUpperCase(), title_vi, discount_type, discount_value, min_order, max_uses, start_date, end_date, is_active, id]
        );
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// 8. Xóa Voucher
export const deleteVoucher = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        try { await pool.query('DELETE FROM user_saved_vouchers WHERE voucher_id = $1', [id]); } catch (e) {}
        await pool.query('DELETE FROM store_vouchers WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};