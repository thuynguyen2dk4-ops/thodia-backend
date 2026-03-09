import { Request, Response } from 'express';
import { pool } from '../config/db';
import { uploadToGCP } from '../services/gcpStorage';

// ==================================================================
// PHẦN 1: QUẢN LÝ THÔNG TIN CỬA HÀNG (CRUD)
// ==================================================================

// 1. Lưu Cửa hàng (Tạo mới hoặc Cập nhật)
export const saveStore = async (req: Request, res: Response) => {
    try {
        const body = req.body as any;
        // 👇 [QUAN TRỌNG] Phải nhận parent_id từ body
        const { id, userId, name_vi, address_vi, phone, category, lat, lng, description_vi, is_premium, parent_id } = body;

        if (!userId) return res.status(400).json({ error: "Thiếu User ID" });

        let image_url = body.image_url || '';
        const files = (req as any).files;

        // Xử lý Avatar
        if (files && files['avatar'] && files['avatar'][0]) {
            try { 
                console.log("🖼️ Đang upload avatar...");
                image_url = await uploadToGCP(files['avatar'][0]); 
            } catch (e) { console.error(e); }
        }

        const isPremiumBool = String(is_premium) === 'true';
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);

        // 👇 [QUAN TRỌNG] Xử lý parent_id
        // Nếu parent_id có giá trị thì giữ nguyên, nếu không thì NULL
        const finalParentId = (parent_id && parent_id !== 'null' && parent_id !== 'undefined' && parent_id !== '') 
            ? parent_id 
            : null;

        let storeId = id;

        // 1. Lưu thông tin Store
        if (id) {
            // 👇 [UPDATE] Câu lệnh UPDATE phải có parent_id=$10
            await pool.query(
                `UPDATE user_stores 
                 SET name_vi=$1, address_vi=$2, phone=$3, category=$4, lat=$5, lng=$6, description_vi=$7, is_premium=$8, image_url=$9, parent_id=$10 
                 WHERE id=$11`,
                [name_vi, address_vi, phone, category, latNum, lngNum, description_vi, isPremiumBool, image_url, finalParentId, id]
            );
        } else {
            // 👇 [UPDATE] Câu lệnh INSERT phải có parent_id
            const newStore = await pool.query(
                `INSERT INTO user_stores 
                 (user_id, name_vi, address_vi, phone, category, lat, lng, description_vi, is_premium, image_url, status, parent_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11) 
                 RETURNING id`,
                [userId, name_vi, address_vi, phone, category, latNum, lngNum, description_vi, isPremiumBool, image_url, finalParentId]
            );
            storeId = newStore.rows[0].id;
        }

        // 2. Xử lý Gallery (Code cũ)
        if (storeId && files && files['gallery']) {
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS store_gallery (
                        id SERIAL PRIMARY KEY,
                        store_id INT REFERENCES user_stores(id) ON DELETE CASCADE,
                        image_url TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                `);
            } catch (e) {}

            const galleryFiles = files['gallery'] as any[]; 
            for (const file of galleryFiles) {
                try {
                    const galleryUrl = await uploadToGCP(file);
                    await pool.query(
                        `INSERT INTO store_gallery (store_id, image_url, created_at) VALUES ($1, $2, NOW())`,
                        [storeId, galleryUrl]
                    );
                } catch (e) {}
            }
        }

        res.json({ success: true, id: storeId });

    } catch (err: any) { 
        console.error("Save Store Error:", err);
        res.status(500).json({ error: err.message }); 
    }
};

// 👇 [QUAN TRỌNG] Hàm này ĐANG BỊ THIẾU trong file cũ của bạn
export const getStoresInBuilding = async (req: Request, res: Response) => {
    try {
        const { buildingId } = req.params;
        // Lấy danh sách con
        const result = await pool.query(
            `SELECT * FROM user_stores 
             WHERE parent_id = $1 AND status = 'approved' 
             ORDER BY is_premium DESC, created_at DESC`, 
            [buildingId]
        );
        
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        
        res.json(formattedRows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// 2. Lấy danh sách cửa hàng của User
export const getUserStores = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;
        const result = await pool.query('SELECT * FROM user_stores WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        
        res.json(formattedRows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// 3. Xóa cửa hàng
export const deleteStore = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM user_stores WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ==================================================================
// PHẦN 2: DỮ LIỆU PUBLIC
// ==================================================================

export const getStorePublic = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM user_stores WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
        
        const store = result.rows[0];
        store.lat = parseFloat(store.lat);
        store.lng = parseFloat(store.lng);
        
        res.json(store);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getApprovedStores = async (req: Request, res: Response) => {
    try {
        // 👇 [QUAN TRỌNG] Thêm: AND parent_id IS NULL
        // Để ẨN các cửa hàng con khỏi bản đồ chính (tránh đè marker)
        const result = await pool.query(
            "SELECT * FROM user_stores WHERE status = 'approved' AND parent_id IS NULL ORDER BY is_premium DESC"
        );
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        res.json(formattedRows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const searchStores = async (req: Request, res: Response) => {
    try {
        const q = `%${req.query.q}%`;
        const result = await pool.query(
            "SELECT * FROM user_stores WHERE (name_vi ILIKE $1 OR address_vi ILIKE $1) AND status='approved' LIMIT 20", 
            [q]
        );
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        res.json(formattedRows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ... (Các phần Menu, Gallery bạn giữ nguyên như cũ, không cần sửa)
// COPY ĐẾN HẾT FILE storeController.ts CỦA BẠN (Menu, Gallery...)
// NHƯNG NHỚ PHẢI CÓ HÀM getStoresInBuilding Ở TRÊN
// VÀ saveStore PHẢI CÓ parent_id

// (Tôi bổ sung nốt phần cuối để bạn copy-paste cho tiện, đỡ bị thiếu)
export const getStoreMenu = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        try {
            await pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS name_vi VARCHAR(255)");
        } catch(e) {}
        const result = await pool.query('SELECT * FROM store_menu_items WHERE store_id = $1 ORDER BY created_at DESC', [id]);
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const saveMenuItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; 
        const { store_id, storeId, name_vi, name, price, description_vi, description, is_available } = req.body;
        const finalStoreId = store_id || storeId;
        const finalName = name_vi || name || 'Món mới';
        const finalDesc = description_vi || description || '';
        const finalPrice = price || 0;
        let image_url = req.body.image_url || '';
        const files = (req as any).files;
        if (files && files['image'] && files['image'][0]) {
            image_url = await uploadToGCP(files['image'][0]);
        }
        if (id) {
            await pool.query(
                `UPDATE store_menu_items SET name=$1, name_vi=$2, price=$3, description_vi=$4, image_url=$5, is_available=$6 WHERE id=$7`,
                [finalName, finalName, finalPrice, finalDesc, image_url, is_available, id]
            );
        } else {
            await pool.query(
                `INSERT INTO store_menu_items (store_id, name, name_vi, price, description_vi, image_url, is_available, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [finalStoreId, finalName, finalName, finalPrice, finalDesc, image_url, is_available || true]
            );
        }
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const deleteMenuItem = async (req: Request, res: Response) => {
    try {
        const { itemId } = req.params;
        await pool.query('DELETE FROM store_menu_items WHERE id = $1', [itemId]);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const getStoreGallery = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM store_gallery WHERE store_id = $1 ORDER BY created_at DESC', [id]);
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const deleteGalleryImage = async (req: Request, res: Response) => {
    try {
        const { imageId } = req.params;
        await pool.query('DELETE FROM store_gallery WHERE id = $1', [imageId]);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};