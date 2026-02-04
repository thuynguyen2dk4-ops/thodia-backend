"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_admin_1 = __importDefault(require("firebase-admin"));
// Khởi tạo không cần tham số credential (nó sẽ dùng Application Default Credentials)
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp({
        projectId: 'winged-ray-485505-m3', // Lấy Project ID trong Project Settings
        storageBucket: 'winged-ray-485505-m3.appspot.com' // Lấy trong tab Storage
    });
}
exports.default = firebase_admin_1.default;
