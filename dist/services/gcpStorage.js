"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToGCP = void 0;
const storage_1 = require("@google-cloud/storage");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// 1. Cấu hình Google Cloud Storage
// Đảm bảo file 'service-account-key.json' nằm ở thư mục gốc backend (ngang hàng với folder src)
const serviceKey = path_1.default.join(__dirname, '../../service-account-key.json');
// Khởi tạo Storage Client
const storage = new storage_1.Storage({
    keyFilename: serviceKey,
    projectId: process.env.GCP_PROJECT_ID, // Đặt ID dự án trong .env hoặc để tự động nhận từ JSON
});
// Tên Bucket (Lấy từ .env hoặc điền trực tiếp tên bucket của bạn vào đây nếu lười chỉnh .env)
// Ví dụ: 'winged-ray-485505-m3.appspot.com'
const bucketName = process.env.GCP_BUCKET_NAME || 'thodia-assets';
const bucket = storage.bucket(bucketName);
// 2. Hàm Upload lên GCP
const uploadToGCP = async (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject('No file provided');
        }
        try {
            // Tạo tên file unique để tránh trùng lặp
            // Xóa khoảng trắng và ký tự đặc biệt trong tên file gốc
            const cleanFileName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');
            const newFileName = `${Date.now()}-${cleanFileName}`;
            const blob = bucket.file(newFileName);
            const blobStream = blob.createWriteStream({
                resumable: false,
                metadata: {
                    contentType: file.mimetype, // Đặt đúng loại file (image/png, image/jpeg...)
                },
            });
            blobStream.on('error', (err) => {
                console.error("❌ GCS Upload Error:", err);
                reject(err);
            });
            blobStream.on('finish', async () => {
                // Link công khai (Yêu cầu Bucket phải set quyền public cho allUsers như hướng dẫn)
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
                console.log(`✅ Upload GCP thành công: ${publicUrl}`);
                resolve(publicUrl);
            });
            // Đẩy dữ liệu file lên
            blobStream.end(file.buffer);
        }
        catch (error) {
            console.error("❌ GCS Try-Catch Error:", error);
            reject(error);
        }
    });
};
exports.uploadToGCP = uploadToGCP;
