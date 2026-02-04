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

const router = express.Router();

// ==================================================================
// CẤU HÌNH UPLOAD FILE (Multer)
// ==================================================================
// Sử dụng MemoryStorage để lấy Buffer, sau đó Controller sẽ upload lên GCP/S3
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
    },
});

// ==================================================================
// 1. STORE & MENU & GALLERY (Dùng storeController mới)
// ==================================================================

// --- Public / General ---
router.get('/stores/approved', storeController.getApprovedStores); // Map hiển thị
router.get('/search/stores', storeController.searchStores);        // Search Bar
router.get('/stores/:id/public', storeController.getStorePublic);  // Store Detail Modal

// --- User Stores Management ---
router.get('/user-stores', storeController.getUserStores);
router.post('/stores/save', 
    upload.fields([
        { name: 'avatar', maxCount: 1 }, 
        { name: 'gallery', maxCount: 10 }
    ]), 
    storeController.saveStore
);
router.delete('/stores/:id', storeController.deleteStore);

// --- Menu Management ---
router.get('/stores/:id/menu', storeController.getStoreMenu);
router.post('/menu-items', 
    upload.fields([{ name: 'image', maxCount: 1 }]), 
    storeController.saveMenuItem // Dùng chung function (ko có id => create)
);
router.put('/menu-items/:id', 
    upload.fields([{ name: 'image', maxCount: 1 }]), 
    storeController.saveMenuItem // Dùng chung function (có id => update)
);
router.delete('/menu-items/:itemId', storeController.deleteMenuItem);

// --- Gallery Management ---
router.get('/stores/:id/gallery', storeController.getStoreGallery);
router.delete('/gallery/:imageId', storeController.deleteGalleryImage);


// ==================================================================
// 2. VOUCHERS
// ==================================================================

// Public: Lấy voucher hiển thị NearbyBanner
// *LƯU Ý: Frontend gọi GET /api/vouchers/active. Bạn cần thêm func getActiveVouchers vào voucherController.
router.get('/vouchers/active', voucherController.getActiveVouchers); 

// User: Ví Voucher (My Vouchers)
// *LƯU Ý: Frontend gọi GET /api/user-vouchers & POST /api/vouchers/save. Cần thêm func saveUserVoucher, getUserVouchers.
router.get('/user-vouchers', voucherController.getUserVouchers);
router.post('/vouchers/save', voucherController.saveUserVoucher);
router.delete('/user-vouchers/:id', voucherController.removeUserVoucher);

// Store Owner: Quản lý Voucher của cửa hàng
router.get('/store-vouchers/:storeId', voucherController.getStoreVouchers);

//Create/Update/Delete Voucher (Frontend gọi POST /api/vouchers/active trong useUserStores)
router.post('/vouchers/active', voucherController.createVoucher); // Logic tạo mới
router.put('/vouchers/:id', voucherController.updateVoucher);     // Cần thêm func updateVoucher
router.delete('/vouchers/:id', voucherController.deleteVoucher);  // Cần thêm func deleteVoucher


// ==================================================================
// 3. REVIEWS
// ==================================================================

router.get('/reviews/list/:storeId', reviewController.getReviews); // ReviewSection
router.get('/reviews/:storeId', reviewController.getReviews);      // BottomSheet (fetchRealRating)
router.post('/reviews', reviewController.addReview);
router.delete('/reviews/:id', reviewController.deleteReview);


// ==================================================================
// 4. FAVORITES
// ==================================================================

router.get('/favorites', favoriteController.getFavorites);
router.post('/favorites', favoriteController.toggleFavorite); // Add/Remove toggle
// Frontend gọi DELETE /api/favorites/:id. Cần thêm func removeFavoriteById hoặc dùng toggle.
router.delete('/favorites/:id', favoriteController.removeFavoriteById); 


// ==================================================================
// 5. JOBS (Tuyển dụng)
// ==================================================================

router.get('/jobs/approved', jobController.getJobsPublic); // JobsPage
router.post('/jobs', jobController.createJob);             // JobsPage (Đăng tin)


// ==================================================================
// 6. CLAIMS (Xác minh chủ sở hữu)
// ==================================================================

router.post('/claims/submit', 
    upload.array('proofFiles', 5), // Frontend gửi key 'proofFiles', max 5 ảnh
    claimController.submitClaim
);


// ==================================================================
// 7. ADMIN DASHBOARD
// ==================================================================

router.get('/admin/check', adminController.checkAdmin);
router.get('/admin/stores', adminController.getStores);
router.put('/admin/stores/:id/status', adminController.updateStoreStatus); // Duyệt store

router.get('/admin/ads', adminController.getAds);
router.put('/admin/ads/cancel/:id', adminController.cancelAd); // Frontend gọi cancel ad

router.get('/admin/jobs', adminController.getJobs);
router.delete('/admin/jobs/:id', adminController.deleteJob);       // Cần thêm
router.put('/admin/jobs/:id/status', adminController.updateJobStatus); // Cần thêm

router.get('/admin/users', adminController.getUsers);
router.delete('/admin/users/:id', adminController.deleteUser);     // Cần thêm

router.get('/admin/claims', adminController.getClaims);
// Frontend gọi 2 route này trong AdminStoreClaims.tsx
router.post('/admin/claims/approve', adminController.approveClaim); // Cần thêm logic duyệt + chuyển quyền sở hữu
router.post('/admin/claims/reject', adminController.rejectClaim);   // Cần thêm logic từ chối


// ==================================================================
// 8. PAYMENT
// ==================================================================

router.post('/payment/create-checkout', paymentController.createPaymentLink);
router.post('/payment/webhook', paymentController.handleWebhook);


export default router;