import { Router } from 'express';
import { confirmOCR, createTransaction, deleteTransaction, importCSV, listTransactions, processOCR, updateTransaction } from '../controllers/transactionController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { csvUpload, receiptUpload, uploadError } from '../middleware/uploadMiddleware.js';
const router = Router(); router.use(requireAuth);
router.get('/', listTransactions); router.post('/', createTransaction); router.put('/:id', updateTransaction); router.delete('/:id', deleteTransaction); router.post('/import-csv', csvUpload, uploadError, importCSV); router.post('/ocr/process', receiptUpload, uploadError, processOCR); router.post('/ocr/:id/confirm', confirmOCR);
export default router;
