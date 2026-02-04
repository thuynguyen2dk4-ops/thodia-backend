"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = exports.createPaymentLink = void 0;
const db_1 = require("../config/db");
const crypto_1 = __importDefault(require("crypto"));
// Cấu hình PayOS (Lấy từ biến môi trường)
const CLIENT_ID = process.env.PAYOS_CLIENT_ID || '';
const API_KEY = process.env.PAYOS_API_KEY || '';
const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || '';
// ==================================================================
// THANH TOÁN (PAYMENT)
// ==================================================================
// 1. Tạo link thanh toán
const createPaymentLink = async (req, res) => {
    try {
        console.log("👉 [PAYMENT] Đang khởi tạo thanh toán...");
        // 1. Kiểm tra cấu hình (Debug)
        if (!CLIENT_ID || !API_KEY || !CHECKSUM_KEY) {
            console.error("❌ [PAYMENT ERROR] Thiếu biến môi trường PayOS!");
            return res.status(500).json({ error: "Lỗi cấu hình server: Thiếu PayOS Key" });
        }
        // Auto-fix DB
        try {
            await db_1.pool.query("ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS description TEXT");
        }
        catch (dbErr) { }
        const { userId, storeId, amount: bodyAmount, description: bodyDesc, returnUrl, cancelUrl, pendingType, type, packageType } = req.body;
        const orderCode = Number(String(Date.now()).slice(-6)); // Mã đơn hàng số
        // --- LOGIC TÍNH TIỀN ---
        let finalAmount = bodyAmount ? Number(bodyAmount) : 2000;
        let finalDescription = bodyDesc || `Thanh toan don ${orderCode}`;
        if (type === 'vip') {
            finalAmount = 100000;
            finalDescription = `Nang cap VIP ${orderCode}`;
        }
        else if (type === 'ad') {
            if (packageType === 'month') {
                finalAmount = 150000;
                finalDescription = `Quang cao Thang ${orderCode}`;
            }
            else if (packageType === 'week') {
                finalAmount = 50000;
                finalDescription = `Quang cao Tuan ${orderCode}`;
            }
        }
        finalAmount = Math.floor(finalAmount);
        console.log(`- Order: ${orderCode} | Amount: ${finalAmount} | Desc: ${finalDescription}`);
        // Lưu DB (Pending)
        await db_1.pool.query(`INSERT INTO payment_transactions 
             (user_id, store_id, amount, order_code, status, description, created_at) 
             VALUES ($1, $2, $3, $4, 'pending', $5, NOW())`, [userId, storeId, finalAmount, orderCode, finalDescription]);
        // Lưu thông tin gói user định mua
        await db_1.pool.query(`UPDATE user_stores 
             SET last_order_code = $1, pending_package_type = $2 
             WHERE id = $3`, [orderCode, pendingType || type, storeId]);
        // --- [DEV MODE ONLY] TỰ ĐỘNG KÍCH HOẠT VIP ĐỂ TEST ---
        // Vì localhost không nhận được Webhook từ PayOS, ta tạm thời kích hoạt luôn ở đây
        // Hãy comment đoạn này lại khi deploy production!
        setTimeout(async () => {
            console.log("⚡ [DEV MODE] Tự động kích hoạt VIP sau 5s...");
            await db_1.pool.query("UPDATE payment_transactions SET status = 'paid' WHERE order_code = $1", [orderCode]);
            await db_1.pool.query("UPDATE user_stores SET is_premium = true WHERE id = $1", [storeId]);
            console.log("✅ [DEV MODE] Đã kích hoạt VIP cho Store:", storeId);
        }, 5000); // Kích hoạt sau 5 giây giả lập thanh toán xong
        // -----------------------------------------------------
        // --- TẠO CHỮ KÝ PAYOS ---
        const signData = `amount=${finalAmount}&cancelUrl=${cancelUrl}&description=${finalDescription}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
        const hmac = crypto_1.default.createHmac("sha256", CHECKSUM_KEY);
        hmac.update(signData);
        const signature = hmac.digest("hex");
        const payload = {
            orderCode,
            amount: finalAmount,
            description: finalDescription,
            buyerName: "User",
            buyerEmail: "user@example.com",
            cancelUrl,
            returnUrl,
            signature,
            items: [{ name: finalDescription, quantity: 1, price: finalAmount }]
        };
        const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": CLIENT_ID,
                "x-api-key": API_KEY
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || result.code !== "00") {
            throw new Error(`PayOS Error: ${result.desc || result.message}`);
        }
        res.json({
            success: true,
            checkoutUrl: result.data.checkoutUrl,
            orderCode
        });
    }
    catch (err) {
        console.error("❌ Payment Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};
exports.createPaymentLink = createPaymentLink;
// 2. Xử lý Webhook
const handleWebhook = async (req, res) => {
    try {
        console.log("🔔 [WEBHOOK] Nhận tín hiệu từ PayOS...");
        const webhookData = req.body;
        const { orderCode } = webhookData.data || {};
        const code = webhookData.code;
        if (code === "00" && orderCode) {
            console.log(`✅ [WEBHOOK] Thanh toán thành công đơn: ${orderCode}`);
            // 1. Cập nhật trạng thái giao dịch
            await db_1.pool.query("UPDATE payment_transactions SET status = 'paid' WHERE order_code = $1", [orderCode]);
            // 2. Tìm Store liên quan
            const storeResult = await db_1.pool.query("SELECT id, pending_package_type FROM user_stores WHERE last_order_code = $1", [orderCode]);
            if (storeResult.rows.length > 0) {
                const store = storeResult.rows[0];
                console.log(`🚀 [WEBHOOK] Kích hoạt VIP cho Store ID: ${store.id}`);
                // 3. Kích hoạt Premium
                await db_1.pool.query("UPDATE user_stores SET is_premium = true WHERE id = $1", [store.id]);
            }
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.handleWebhook = handleWebhook;
