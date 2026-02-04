"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectClaim = exports.approveClaim = exports.getClaims = exports.deleteUser = exports.getUsers = exports.deleteJob = exports.updateJobStatus = exports.getJobs = exports.cancelAd = exports.getAds = exports.updateStoreStatus = exports.getStores = exports.checkAdmin = void 0;
const db_1 = require("../config/db");
// ==================================================================
// 1. SYSTEM & AUTH CHECK
// ==================================================================
const checkAdmin = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId)
            return res.json({ isAdmin: false });
        const result = await db_1.pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
        if (result.rows.length > 0 && result.rows[0].role === 'admin') {
            res.json({ isAdmin: true });
        }
        else {
            res.json({ isAdmin: false });
        }
    }
    catch (err) {
        console.error("❌ Check Admin Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.checkAdmin = checkAdmin;
// ==================================================================
// 2. STORE MANAGEMENT
// ==================================================================
const getStores = async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT s.*, u.email as user_email 
            FROM user_stores s 
            LEFT JOIN profiles u ON s.user_id = u.id 
        `;
        let params = [];
        if (status && status !== 'all') {
            query += ' WHERE s.status = $1';
            params.push(status);
        }
        query += ' ORDER BY s.created_at DESC';
        const result = await db_1.pool.query(query, params);
        res.json(result.rows);
    }
    catch (err) {
        console.error("❌ Get Stores Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getStores = getStores;
const updateStoreStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await db_1.pool.query('UPDATE user_stores SET status = $1 WHERE id = $2', [status, id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error("❌ Update Store Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.updateStoreStatus = updateStoreStatus;
// ==================================================================
// 3. ADS MANAGEMENT
// ==================================================================
const getAds = async (req, res) => {
    try {
        const result = await db_1.pool.query(`
            SELECT a.*, s.name_vi, s.image_url, u.email as user_email
            FROM sponsored_listings a
            JOIN user_stores s ON a.store_id = s.id
            LEFT JOIN profiles u ON s.user_id = u.id
            WHERE a.status = 'active'
            ORDER BY a.created_at DESC
        `);
        res.json(result.rows);
    }
    catch (err) {
        console.error("❌ Get Ads Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getAds = getAds;
const cancelAd = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.pool.query("UPDATE sponsored_listings SET status = 'cancelled', end_date = NOW() WHERE id = $1", [id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.cancelAd = cancelAd;
// ==================================================================
// 4. JOB MANAGEMENT
// ==================================================================
const getJobs = async (req, res) => {
    try {
        const result = await db_1.pool.query(`
            SELECT j.*, s.name_vi as shop_name, s.address_vi as address, s.phone, u.email as user_email
            FROM recruitment_posts j
            JOIN user_stores s ON j.store_id = s.id
            LEFT JOIN profiles u ON s.user_id = u.id
            ORDER BY j.created_at DESC
        `);
        res.json(result.rows);
    }
    catch (err) {
        console.error("❌ Get Jobs Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getJobs = getJobs;
const updateJobStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await db_1.pool.query('UPDATE recruitment_posts SET status = $1 WHERE id = $2', [status, id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.updateJobStatus = updateJobStatus;
const deleteJob = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.pool.query('DELETE FROM recruitment_posts WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteJob = deleteJob;
// ==================================================================
// 5. USER MANAGEMENT
// ==================================================================
const getUsers = async (req, res) => {
    try {
        const result = await db_1.pool.query(`
            SELECT p.*, r.role 
            FROM profiles p
            LEFT JOIN user_roles r ON p.id = r.user_id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    }
    catch (err) {
        console.error("❌ Get Users Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getUsers = getUsers;
const deleteUser = async (req, res) => {
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
        await client.query('DELETE FROM user_favorites WHERE user_id = $1', [id]);
        await client.query('DELETE FROM user_saved_vouchers WHERE user_id = $1', [id]);
        await client.query('DELETE FROM store_reviews WHERE user_id = $1', [id]);
        await client.query('DELETE FROM store_claims WHERE user_id = $1', [id]);
        const userStores = await client.query('SELECT id FROM user_stores WHERE user_id = $1', [id]);
        for (const store of userStores.rows) {
            await client.query('DELETE FROM store_menu_items WHERE store_id = $1', [store.id]);
            await client.query('DELETE FROM store_vouchers WHERE store_id = $1', [store.id]);
            await client.query('DELETE FROM store_gallery WHERE store_id = $1', [store.id]);
            await client.query('DELETE FROM recruitment_posts WHERE store_id = $1', [store.id]);
            await client.query('DELETE FROM user_stores WHERE id = $1', [store.id]);
        }
        await client.query('DELETE FROM profiles WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Delete User Error:", err);
        res.status(500).json({ error: err.message });
    }
    finally {
        client.release();
    }
};
exports.deleteUser = deleteUser;
// ==================================================================
// 6. CLAIM MANAGEMENT (Đã fix hiển thị Tên & Địa chỉ)
// ==================================================================
const getClaims = async (req, res) => {
    console.log("👉 [DEBUG] Đang gọi API getClaims...");
    try {
        const result = await db_1.pool.query(`
            SELECT c.*, 
                   s.id as existing_store_id,
                   s.name_vi as existing_store_name, 
                   s.status as store_status,
                   p.email as existing_owner_email,
                   u.email as claimer_email
            FROM store_claims c
            LEFT JOIN profiles u ON c.user_id = u.id
            LEFT JOIN user_stores s ON CAST(c.store_id AS TEXT) = CAST(s.id AS TEXT) 
            LEFT JOIN profiles p ON s.user_id = p.id
            WHERE c.status = 'pending'
            ORDER BY c.created_at DESC
        `);
        const mappedRows = result.rows.map(row => {
            // Logic tách địa chỉ từ message cũ (nếu có)
            let fallbackName = 'Thông tin khác';
            let fallbackAddress = 'Chi tiết trong yêu cầu';
            if (row.message && row.message.includes('|')) {
                const parts = row.message.split('|');
                fallbackName = parts[0];
                if (parts.length > 1) {
                    fallbackAddress = parts[1].split('\n')[0];
                }
            }
            const finalName = row.store_name || fallbackName;
            let finalAddress = row.store_address || fallbackAddress;
            // [FIX HIỂN THỊ] Nếu địa chỉ quá chung chung, thử hiển thị Tọa độ để Admin dễ duyệt
            if (finalAddress === 'Địa điểm trên bản đồ' && row.lat && row.lng) {
                finalAddress = `Tọa độ: ${row.lat}, ${row.lng}`;
            }
            return {
                id: row.id,
                created_at: row.created_at,
                user_id: row.user_id,
                // [FIX] Trả về nguyên gốc Tên Quán, KHÔNG gộp với địa chỉ nữa
                mapbox_name: finalName,
                // Địa chỉ trả về riêng
                mapbox_address: finalAddress,
                mapbox_id: row.store_id,
                lat: row.lat ? parseFloat(row.lat) : 0,
                lng: row.lng ? parseFloat(row.lng) : 0,
                phone: row.phone,
                email: row.email,
                role: row.role,
                message: row.message,
                proof_image_url: row.image_url,
                proof_images: (row.images && Array.isArray(row.images) && row.images.length > 0)
                    ? row.images
                    : (row.image_url ? [row.image_url] : []),
                profiles: { email: row.claimer_email || 'No Email' },
                existingStore: row.existing_store_id ? {
                    id: row.existing_store_id,
                    name_vi: row.existing_store_name,
                    owner_email: row.existing_owner_email,
                    is_verified: row.store_status === 'approved'
                } : null
            };
        });
        res.json(mappedRows);
    }
    catch (err) {
        console.error("❌ [ERROR] Lỗi tại getClaims:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getClaims = getClaims;
const approveClaim = async (req, res) => {
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const { claimId, mapboxId, userId, mapboxName, mapboxAddress, lat, lng, phone, proofImageUrl, category } = req.body;
        const existingCheck = await client.query(`SELECT id FROM user_stores WHERE name_vi = $1 AND abs(lat - $2) < 0.0001 AND abs(lng - $3) < 0.0001`, [mapboxName, lat, lng]);
        const finalCategory = category || 'food';
        const finalLat = parseFloat(lat || 0);
        const finalLng = parseFloat(lng || 0);
        let finalStoreId;
        if (existingCheck.rows.length > 0) {
            finalStoreId = existingCheck.rows[0].id;
            await client.query(`UPDATE user_stores 
                 SET user_id = $1, status = 'approved', phone = $2,
                     category = $4, lat = $5, lng = $6, 
                     name_vi = $7, address_vi = $8, image_url = $9
                 WHERE id = $3`, [
                userId,
                phone || null,
                finalStoreId,
                finalCategory,
                finalLat,
                finalLng,
                mapboxName,
                mapboxAddress,
                proofImageUrl || ''
            ]);
        }
        else {
            const newStore = await client.query(`INSERT INTO user_stores 
                 (user_id, name_vi, address_vi, lat, lng, phone, category, status, image_url, is_premium)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, false)
                 RETURNING id`, [
                userId,
                mapboxName,
                mapboxAddress || 'Đang cập nhật',
                finalLat,
                finalLng,
                phone || null,
                finalCategory,
                proofImageUrl || ''
            ]);
            finalStoreId = newStore.rows[0].id;
        }
        await client.query("UPDATE store_claims SET status = 'approved' WHERE id = $1", [claimId]);
        await client.query('COMMIT');
        res.json({ success: true, storeId: finalStoreId });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Approve Claim Error:", err);
        res.status(500).json({ error: err.message });
    }
    finally {
        client.release();
    }
};
exports.approveClaim = approveClaim;
const rejectClaim = async (req, res) => {
    try {
        const { claimId } = req.body;
        await db_1.pool.query("UPDATE store_claims SET status = 'rejected' WHERE id = $1", [claimId]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.rejectClaim = rejectClaim;
