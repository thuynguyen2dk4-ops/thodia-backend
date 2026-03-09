import express from 'express';
import multer from 'multer';

// Import Controllers
import * as storeController from '../controllers/storeController';
import * as adminController from '../controllers/adminController';
import * as voucherController from '../controllers/voucherController';
import * as jobController from '../controllers/jobController';
import * as claimController from '../controllers/claimController';
import * as reviewController from '../controllers/reviewController';
import * as favoriteController from '../controllers/favoriteController';
import * as paymentController from '../controllers/paymentController';
import * as directionController from '../controllers/directionController';

// Import các hàm cụ thể từ storeController (để tránh lỗi undefined)
import { 
    getStoresInBuilding, // 👈 Hàm quan trọng cho Sub-stores
    saveStore,
    saveMenuItem 
} from '../controllers/storeController';

const router = express.Router();

// ==================================================================
// CẤU HÌNH UPLOAD FILE (Multer)
// ==================================================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ==================================================================
// 1. STORE (CỬA HÀNG)
// ==================================================================

// --- Public / General ---
router.get('/directions', directionController.getSmartRoute);
router.get('/stores/approved', storeController.getApprovedStores); // Map hiển thị
router.get('/search/stores', storeController.searchStores);        // Search Bar
router.get('/stores/:id/public', storeController.getStorePublic);  // Store Detail Modal

// 👇 [QUAN TRỌNG] Route lấy danh sách cửa hàng con (Fix lỗi 404)
// Frontend gọi: /api/stores/:buildingId/sub-stores
router.get('/stores/:buildingId/sub-stores', getStoresInBuilding); 

// --- User Stores Management (Quản lý cửa hàng) ---
router.get('/user-stores', storeController.getUserStores);

// 👇 [QUAN TRỌNG] Route lưu cửa hàng (Fix lỗi Upload Avatar)
// Frontend gọi: /api/stores/save
router.post('/stores/save', 
    upload.fields([
        { name: 'avatar', maxCount: 1 }, 
        { name: 'gallery', maxCount: 10 }
    ]), 
    saveStore
);

router.delete('/stores/:id', storeController.deleteStore);

// ==================================================================
// 2. MENU & GALLERY
// ==================================================================

// --- Menu ---
router.get('/stores/:id/menu', storeController.getStoreMenu);

// Lưu Menu (Create/Update) - Có upload ảnh
router.post('/menu-items', upload.fields([{ name: 'image', maxCount: 1 }]), saveMenuItem);
router.put('/menu-items/:id', upload.fields([{ name: 'image', maxCount: 1 }]), saveMenuItem);
router.delete('/menu-items/:itemId', storeController.deleteMenuItem);

// --- Gallery ---
router.get('/stores/:id/gallery', storeController.getStoreGallery);
router.delete('/gallery/:imageId', storeController.deleteGalleryImage);


// ==================================================================
// 3. VOUCHERS
// ==================================================================

router.get('/vouchers/active', voucherController.getActiveVouchers); 
router.get('/user-vouchers', voucherController.getUserVouchers);
router.post('/vouchers/save', voucherController.saveUserVoucher);
router.delete('/user-vouchers/:id', voucherController.removeUserVoucher);
router.get('/store-vouchers/:storeId', voucherController.getStoreVouchers);

router.post('/vouchers/active', voucherController.createVoucher);
router.put('/vouchers/:id', voucherController.updateVoucher);
router.delete('/vouchers/:id', voucherController.deleteVoucher);


// ==================================================================
// 4. REVIEWS (ĐÁNH GIÁ)
// ==================================================================

router.get('/reviews/list/:storeId', reviewController.getReviews);
router.get('/reviews/:storeId', reviewController.getReviews);
router.post('/reviews', reviewController.addReview);
router.delete('/reviews/:id', reviewController.deleteReview);


// ==================================================================
// 5. FAVORITES (YÊU THÍCH)
// ==================================================================

router.get('/favorites', favoriteController.getFavorites);
router.post('/favorites', favoriteController.toggleFavorite); 
router.delete('/favorites/:id', favoriteController.removeFavoriteById); 


// ==================================================================
// 6. JOBS (TUYỂN DỤNG)
// ==================================================================

router.get('/jobs/approved', jobController.getJobsPublic);
router.post('/jobs', jobController.createJob);


// ==================================================================
// 7. CLAIMS (XÁC MINH CHỦ SỞ HỮU)
// ==================================================================

router.post('/claims/submit', 
    upload.array('proofFiles', 5), 
    claimController.submitClaim
);


// ==================================================================
// 8. ADMIN DASHBOARD
// ==================================================================

router.get('/admin/check', adminController.checkAdmin);
router.get('/admin/stores', adminController.getStores);
router.put('/admin/stores/:id/status', adminController.updateStoreStatus);

router.get('/admin/ads', adminController.getAds);
router.put('/admin/ads/cancel/:id', adminController.cancelAd);

router.get('/admin/jobs', adminController.getJobs);
router.delete('/admin/jobs/:id', adminController.deleteJob);       
router.put('/admin/jobs/:id/status', adminController.updateJobStatus); 

router.get('/admin/users', adminController.getUsers);
router.delete('/admin/users/:id', adminController.deleteUser);     

router.get('/admin/claims', adminController.getClaims);
router.post('/admin/claims/approve', adminController.approveClaim);
router.post('/admin/claims/reject', adminController.rejectClaim);


// ==================================================================
// 9. PAYMENT
// ==================================================================

router.post('/payment/create-checkout', paymentController.createPaymentLink);
router.post('/payment/webhook', paymentController.handleWebhook);


export default router;