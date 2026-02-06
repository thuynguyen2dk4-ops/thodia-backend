import { Request, Response } from 'express';
import { pool } from '../config/db';

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";

/**
 * SMART SEARCH ENGINE - PHIÊN BẢN THU HOẠCH DỮ LIỆU
 * 1. Tìm trong user_stores (Quán hệ thống)
 * 2. Tìm trong harvested_places (Dữ liệu đã thu hoạch từ Mapbox trước đó)
 * 3. Nếu thiếu kết quả -> Gọi Mapbox API -> Lưu (Harvest) vào DB -> Trả về
 */
export const searchSmart = async (req: Request, res: Response) => {
    try {
        const { q, lat, lng } = req.query;
        if (!q) return res.json([]);

        const queryStr = String(q).trim();
        const limit = 8;
        let finalResults: any[] = [];

        // --- BƯỚC 1: TÌM TRONG QUÁN HỆ THỐNG (ƯU TIÊN 1) ---
        const systemStores = await pool.query(
            `SELECT id, name_vi, address_vi, lat, lng, category, image_url, 'system' as source
             FROM user_stores 
             WHERE status = 'approved' AND (name_vi ILIKE $1 OR address_vi ILIKE $1)
             LIMIT 3`,
            [`%${queryStr}%`]
        );
        finalResults = [...systemStores.rows];

        // --- BƯỚC 2: TÌM TRONG DỮ LIỆU ĐÃ THU HOẠCH (ƯU TIÊN 2) ---
        if (finalResults.length < limit) {
            const harvested = await pool.query(
                `SELECT mapbox_id as id, name_vi, address_vi, lat, lng, category, 'harvested' as source
                 FROM harvested_places 
                 WHERE name_vi ILIKE $1 OR address_vi ILIKE $1
                 LIMIT $2`,
                [`%${queryStr}%`, limit - finalResults.length]
            );
            finalResults = [...finalResults, ...harvested.rows];
        }

        // --- BƯỚC 3: GỌI MAPBOX NẾU VẪN THIẾU (VÀ THU HOẠCH) ---
        if (finalResults.length < 3) { // Nếu dữ liệu nội bộ quá ít, gọi Mapbox để bổ sung
            const proximity = (lat && lng) ? `&proximity=${lng},${lat}` : '';
            const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryStr)}.json?access_token=${MAPBOX_TOKEN}&country=vn&autocomplete=true&limit=5&language=vi&types=poi,address${proximity}`;
            
            const response = await fetch(mapboxUrl);
            const data: any = await response.json();

            if (data.features) {
                for (const feature of data.features) {
                    const mbId = feature.id;
                    const name = feature.text;
                    const address = feature.place_name;
                    const [m_lng, m_lat] = feature.center;
                    const category = feature.properties?.category || 'address';

                    // Thêm vào kết quả trả về ngay
                    if (!finalResults.find(r => r.mapbox_id === mbId)) {
                        finalResults.push({
                            id: mbId,
                            name_vi: name,
                            address_vi: address,
                            lat: m_lat,
                            lng: m_lng,
                            category,
                            source: 'mapbox_new'
                        });
                    }

                    // --- LOGIC THU HOẠCH (HARVESTING) ---
                    // Lưu vào DB nếu chưa tồn tại Mapbox ID này
                    pool.query(
                        `INSERT INTO harvested_places (mapbox_id, name_vi, address_vi, category, lat, lng, raw_data)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT (mapbox_id) DO NOTHING`,
                        [mbId, name, address, category, m_lat, m_lng, JSON.stringify(feature)]
                    ).catch(e => console.error("Harvesting error:", e));
                }
            }
        }

        res.json(finalResults.slice(0, limit));

    } catch (err: any) {
        console.error("Smart Search Error:", err);
        res.status(500).json({ error: err.message });
    }
};