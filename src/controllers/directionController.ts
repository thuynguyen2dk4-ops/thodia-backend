import { Request, Response } from 'express';
import { pool } from '../config/db';

/**
 * THUẬT TOÁN CHỈ ĐƯỜNG THÔNG MINH (SMART ROUTING)
 * - Sử dụng Mapbox Directions API với tham số nâng cao để chống ngược chiều.
 * - Hỗ trợ lộ trình đa điểm (Multi-stop waypoints).
 * - Tự động lọc các quán xá (Landmarks) nằm dọc theo đường đi để hiện trên bản đồ.
 */

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || "";

// --- HÀM HỖ TRỢ: TÍNH KHOẢNG CÁCH TỪ ĐIỂM ĐẾN ĐOẠN THẲNG ---
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const distToSegment = (p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) => {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 == 0) return getDistance(p.x, p.y, v.x, v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return getDistance(p.x, p.y, v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
};

export const getSmartRoute = async (req: Request, res: Response) => {
    try {
        /**
         * waypoints: Chuỗi lng,lat;lng,lat...
         * bearings: Góc hướng đầu xe (để chống ngược chiều)
         * radiuses: Bán kính snap (để ép làn)
         */
        const { 
            waypoints, 
            mode = 'driving', 
            radiuses, 
            bearings, 
            approaches, 
            continue_straight = 'true' 
        } = req.query;

        if (!waypoints) {
            return res.status(400).json({ error: "Thiếu tọa độ điểm đi/đến" });
        }

        // 1. Gọi Mapbox API với định dạng GeoJSON để Frontend vẽ chính xác tuyệt đối
        const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${waypoints}?geometries=geojson&overview=full&steps=true&banner_instructions=true&radiuses=${radiuses}&bearings=${bearings}&approaches=${approaches}&continue_straight=${continue_straight}&access_token=${MAPBOX_TOKEN}`;
        
        // @ts-ignore
        const mapRes = await fetch(mapboxUrl);
        const mapData: any = await mapRes.json();

        if (!mapData.routes || mapData.routes.length === 0) {
            return res.status(404).json({ error: "Không tìm thấy lộ trình" });
        }

        const route = mapData.routes[0];
        const routeCoords = route.geometry.coordinates; // Dạng [[lng, lat], ...]

        // 2. Lấy Bounding Box để truy vấn Database hiệu quả
        const lats = routeCoords.map((p: any) => p[1]);
        const lngs = routeCoords.map((p: any) => p[0]);

        const storesRes = await pool.query(
            `SELECT id, name_vi, address_vi, lat, lng, image_url, category 
             FROM user_stores 
             WHERE status = 'approved' 
             AND lat BETWEEN $1 AND $2 
             AND lng BETWEEN $3 AND $4`,
            [Math.min(...lats) - 0.005, Math.max(...lats) + 0.005, Math.min(...lngs) - 0.005, Math.max(...lngs) + 0.005]
        );

        // 3. Lọc quán nằm sát lộ trình (< 100m) để hiện Pin
        const landmarksAlongRoute = storesRes.rows.filter(store => {
            const storeLat = parseFloat(store.lat);
            const storeLng = parseFloat(store.lng);
            // Kiểm tra store có gần bất kỳ đoạn đường nào không (nhảy bước 3 để tối ưu)
            for (let i = 0; i < routeCoords.length - 1; i += 3) { 
                const dist = distToSegment(
                    { x: storeLat, y: storeLng }, 
                    { x: routeCoords[i][1], y: routeCoords[i][0] }, 
                    { x: routeCoords[i+1][1], y: routeCoords[i+1][0] }
                );
                if (dist < 100) return true;
            }
            return false;
        });

        // 4. Trả về kết quả
        res.json({
            route: {
                distance: route.distance,
                duration: route.duration,
                geometry: route.geometry, // Đối tượng GeoJSON hoàn chỉnh
                legs: route.legs,
                steps: route.legs.flatMap((leg: any) => leg.steps)
            },
            waypoints: mapData.waypoints, // Tọa độ chính xác đã snap của các điểm đến (để hiện Pin)
            landmarks: landmarksAlongRoute // Quán xá đối tác dọc đường
        });

    } catch (err: any) {
        console.error("❌ Direction API Error:", err);
        res.status(500).json({ error: err.message });
    }
};