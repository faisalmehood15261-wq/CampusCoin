import { Budget, Category, Notification, Transaction } from '../models/index.js';
import { monthKey } from '../utils/http.js';

export async function flagTransaction({ userId, amount, type, description, date }) {
  if (type !== 'expense') return { duplicateStatus: 'none', unusuallyLarge: false };
  const selectedDate = new Date(date || Date.now()); const start = new Date(selectedDate); start.setDate(start.getDate() - 2); const end = new Date(selectedDate); end.setDate(end.getDate() + 2);
  const duplicate = await Transaction.exists({ userId, type: 'expense', amount, date: { $gte: start, $lte: end }, description: new RegExp(`^${String(description || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const aggregate = await Transaction.aggregate([{ $match: { userId, type: 'expense' } }, { $group: { _id: null, avg: { $avg: '$amount' } } }]);
  return { duplicateStatus: duplicate ? 'possible_duplicate' : 'none', unusuallyLarge: Boolean(aggregate[0]?.avg && amount > aggregate[0].avg * 2.5) };
}
export async function evaluateBudget(transaction) {
  if (transaction.type !== 'expense') return;
  const month = monthKey(transaction.date); const budget = await Budget.findOne({ userId: transaction.userId, categoryId: transaction.categoryId, month }); if (!budget) return;
  const spend = await Transaction.aggregate([{ $match: { userId: transaction.userId, categoryId: transaction.categoryId, type: 'expense', date: { $gte: new Date(`${month}-01T00:00:00.000Z`), $lt: new Date(new Date(`${month}-01T00:00:00.000Z`).setMonth(new Date(`${month}-01T00:00:00.000Z`).getMonth() + 1)) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  const total = spend[0]?.total || 0; const percent = (total / budget.limitAmount) * 100;
  if (percent >= 100 || percent >= budget.warningPercentage) await Notification.create({ userId: transaction.userId, type: percent >= 100 ? 'budget_exceeded' : 'budget_warning', title: percent >= 100 ? 'Budget exceeded' : 'Budget warning', message: `${percent >= 100 ? 'You exceeded' : 'You reached'} ${Math.round(percent)}% of this category's monthly budget.` });
}
export async function transactionSummary(userId, month = monthKey()) {
  const start = new Date(`${month}-01T00:00:00.000Z`); const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const rows = await Transaction.aggregate([{ $match: { userId, date: { $gte: start, $lt: end } } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]);
  const amounts = Object.fromEntries(rows.map(r => [r._id, r.total]));
  const categories = await Transaction.aggregate([{ $match: { userId, type: 'expense', date: { $gte: start, $lt: end } } }, { $group: { _id: '$categoryId', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }, { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } }, { $unwind: '$category' }]);
  return { income: amounts.income || 0, expense: amounts.expense || 0, balance: (amounts.income || 0) - (amounts.expense || 0), categories, start, end };
}
