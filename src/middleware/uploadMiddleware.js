import multer from 'multer';
import { fail } from '../utils/http.js';
const imageFilter = (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
export const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: imageFilter }).single('receipt');
export const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) }).single('file');
export function uploadError(error, _req, _res, next) { if (error instanceof multer.MulterError) return next(fail(error.code === 'LIMIT_FILE_SIZE' ? 'The upload exceeds the allowed size.' : error.message)); if (error) return next(fail('Only permitted receipt images or CSV files can be uploaded.')); next(); }
