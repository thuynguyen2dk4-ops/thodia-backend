import admin from 'firebase-admin';

// Khởi tạo không cần tham số credential (nó sẽ dùng Application Default Credentials)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'winged-ray-485505-m3', // Lấy Project ID trong Project Settings
    storageBucket: 'winged-ray-485505-m3.appspot.com' // Lấy trong tab Storage
  });
}

export default admin;