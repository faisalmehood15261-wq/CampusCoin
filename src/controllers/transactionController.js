import { Readable } from 'node:stream';
import csv from 'csv-parser';
import { Category, Notification, OCRImport, Transaction, ActivityLog } from '../models/index.js';
import { asyncHandler, fail, monthKey } from '../utils/http.js';
import { evaluateBudget, flagTransaction } from '../services/financeService.js';
import { createWorker } from 'tesseract.js';

const ownCategory = async (id, userId, type) => { const category = await Category.findOne({ _id: id, type, $or: [{ userId }, { isDefault: true }] }); if (!category) throw fail('Choose a category you can access that matches the transaction type.'); return category; };
const transactionPayload = async (body, userId, method = 'manual') => { const { categoryId, amount, type, description, source, date, isRecurring, recurringType, notes, aiSuggestedCategory, aiConfidence, isAICategoryAccepted } = body; if (!categoryId || !amount || !type) throw fail('Amount, type, and category are required.'); await ownCategory(categoryId, userId, type); const normalized = { userId, categoryId, amount: Number(amount), type, description: description?.trim(), source: source?.trim(), date: date ? new Date(date) : new Date(), isRecurring: Boolean(isRecurring), recurringType: isRecurring ? recurringType || 'monthly' : null, notes, inputMethod: method, aiSuggestedCategory, aiConfidence, isAICategoryAccepted }; if (!(normalized.amount > 0)) throw fail('Amount must be greater than zero.'); return { ...normalized, ...(await flagTransaction(normalized)) }; };
export const listTransactions = asyncHandler(async (req, res) => { const { type, categoryId, search, month, from, to, page = 1, limit = 30 } = req.query; const query = { userId: req.user._id }; if (type) query.type = type; if (categoryId) query.categoryId = categoryId; if (search) query.$or = [{ description: new RegExp(search, 'i') }, { source: new RegExp(search, 'i') }]; if (month) { const start = new Date(`${month}-01T00:00:00.000Z`); const end = new Date(start); end.setMonth(end.getMonth() + 1); query.date = { $gte: start, $lt: end }; } else if (from || to) query.date = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) }; const [items, total] = await Promise.all([Transaction.find(query).populate('categoryId', 'name icon type').sort({ date: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Math.min(Number(limit), 100)), Transaction.countDocuments(query)]); res.json({ success: true, items, total, page: Number(page) }); });
export const createTransaction = asyncHandler(async (req, res) => { const transaction = await Transaction.create(await transactionPayload(req.body, req.user._id)); await evaluateBudget(transaction); if (transaction.duplicateStatus !== 'none') await Notification.create({ userId: req.user._id, type: 'duplicate', title: 'Possible duplicate transaction', message: 'A similar transaction was found within two days. Please review it.' }); if (transaction.unusuallyLarge) await Notification.create({ userId: req.user._id, type: 'unusual_transaction', title: 'Unusually large expense', message: 'This expense is much larger than your usual spending.' }); await ActivityLog.create({ userId: req.user._id, action: 'created', entityType: 'transaction', entityId: transaction._id }); res.status(201).json({ success: true, item: await transaction.populate('categoryId', 'name icon') }); });
export const updateTransaction = asyncHandler(async (req, res) => { const existing = await Transaction.findOne({ _id: req.params.id, userId: req.user._id }); if (!existing) throw fail('Transaction not found.', 404); const payload = await transactionPayload({ ...existing.toObject(), ...req.body }, req.user._id, existing.inputMethod); Object.assign(existing, payload); await existing.save(); await evaluateBudget(existing); await ActivityLog.create({ userId: req.user._id, action: 'edited', entityType: 'transaction', entityId: existing._id }); res.json({ success: true, item: await existing.populate('categoryId', 'name icon') }); });
export const deleteTransaction = asyncHandler(async (req, res) => { const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.user._id }); if (!transaction) throw fail('Transaction not found.', 404); await ActivityLog.create({ userId: req.user._id, action: 'deleted', entityType: 'transaction', entityId: transaction._id }); res.json({ success: true }); });
function parseCSV(buffer) { return new Promise((resolve, reject) => { const rows = []; Readable.from(buffer).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject); }); }
export const importCSV = asyncHandler(async (req, res) => { if (!req.file) throw fail('Upload a CSV file.'); const rows = await parseCSV(req.file.buffer); if (!rows.length) throw fail('The CSV is empty.'); if (rows.length > 500) throw fail('Import up to 500 rows at a time.'); const categories = await Category.find({ $or: [{ userId: req.user._id }, { isDefault: true }] }); const imported = []; const errors = []; for (let i = 0; i < rows.length; i += 1) { try { const row = rows[i]; const type = String(row.type || row.Type || 'expense').toLowerCase(); const name = String(row.category || row.Category || 'Miscellaneous').trim(); const category = categories.find(c => c.type === type && c.name.toLowerCase() === name.toLowerCase()); if (!category) throw new Error(`Category “${name}” (${type}) is unavailable.`); imported.push(await transactionPayload({ amount: row.amount || row.Amount, type, categoryId: category._id, description: row.description || row.Description, source: row.source || row.Source, date: row.date || row.Date, notes: row.notes || row.Notes }, req.user._id, 'csv')); } catch (error) { errors.push({ row: i + 2, message: error.message }); } } const saved = imported.length ? await Transaction.insertMany(imported) : []; await Promise.all(saved.map(evaluateBudget)); res.status(201).json({ success: true, imported: saved.length, errors }); });
const detectReceipt = (text) => { const amounts = [...text.matchAll(/(?:Rs\.?|PKR|\$)?\s*([0-9]{1,7}(?:[,.][0-9]{2})?)/gi)].map(m => Number(m[1].replace(',', ''))).filter(n => Number.isFinite(n)); const dateMatch = text.match(/\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/); return { detectedAmount: amounts.length ? Math.max(...amounts) : undefined, detectedDate: dateMatch ? new Date(dateMatch[0]) : undefined, detectedDescription: text.split(/\n+/).map(x => x.trim()).find(x => x.length > 3 && !/total|cash|tax|date/i.test(x)) || '' }; };
const OCR_LANG_PATH = process.cwd();

async function recognizeReceipt(image) {
	let worker;
	let timedOut = false;
	let timeoutId;
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => {
			timedOut = true;
			reject(fail('Receipt OCR timed out. Try a smaller or clearer image.', 504));
		}, 45_000);
	});
	const workerPromise = createWorker('eng', 1, {
		langPath: OCR_LANG_PATH,
		gzip: false,
		cacheMethod: 'none'
	});
	workerPromise.then(createdWorker => {
		if (timedOut) createdWorker.terminate().catch(() => {});
	}, () => {});

	try {
		worker = await Promise.race([workerPromise, timeout]);
		const result = await Promise.race([
			worker.recognize(image),
			timeout
		]);
		return result.data.text;
	} finally {
		clearTimeout(timeoutId);
		if (worker) await worker.terminate();
	}
}

export const processOCR = asyncHandler(async (req, res) => { if (!req.file) throw fail('Upload a JPEG, PNG, or WebP receipt image.'); const item = await OCRImport.create({ userId: req.user._id, fileName: req.file.originalname, ocrStatus: 'processing' }); try { const text = await recognizeReceipt(req.file.buffer); const detected = detectReceipt(text); const categories = await Category.find({ type: 'expense', $or: [{ userId: req.user._id }, { isDefault: true }] }); const candidate = categories.find(c => text.toLowerCase().includes(c.name.toLowerCase())); Object.assign(item, { extractedText: text, ...detected, detectedType: 'expense', detectedCategory: candidate?._id, ocrStatus: 'completed' }); await item.save(); res.json({ success: true, item: await item.populate('detectedCategory', 'name icon'), message: 'Review and correct the extracted values before saving a transaction.' }); } catch (error) { item.ocrStatus = 'failed'; await item.save(); throw fail(`OCR could not read this image: ${error.message}`, 422); } });
export const confirmOCR = asyncHandler(async (req, res) => { const receipt = await OCRImport.findOne({ _id: req.params.id, userId: req.user._id }); if (!receipt || receipt.ocrStatus !== 'completed') throw fail('Completed OCR record not found.', 404); if (receipt.createdTransactionId) throw fail('This OCR result has already been saved.', 409); const transaction = await Transaction.create(await transactionPayload(req.body, req.user._id, 'ocr')); receipt.createdTransactionId = transaction._id; await receipt.save(); await evaluateBudget(transaction); res.status(201).json({ success: true, item: transaction }); });
