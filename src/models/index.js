import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const objectId = Schema.Types.ObjectId;
const stamp = { timestamps: true };
const named = (name, schema, collection) => models[name] || model(name, new Schema(schema, stamp), collection);

export const User = named('User', {
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false }, googleId: { type: String, sparse: true, unique: true }, avatar: String,
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' }, role: { type: String, enum: ['student', 'admin'], default: 'student' },
  academicYear: { type: String, trim: true, maxlength: 60 }, monthlyAllowance: { type: Number, min: 0, default: 0 }, savingsGoal: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true }, lastLoginAt: Date
}, 'users');

export const Category = named('Category', { name: { type: String, required: true, trim: true, maxlength: 50 }, type: { type: String, enum: ['income', 'expense'], required: true }, userId: { type: objectId, ref: 'User', default: null }, isDefault: { type: Boolean, default: false }, icon: { type: String, default: 'tag' } }, 'categories');

export const Transaction = named('Transaction', {
  userId: { type: objectId, ref: 'User', required: true, index: true }, categoryId: { type: objectId, ref: 'Category', required: true }, amount: { type: Number, required: true, min: 0.01 }, type: { type: String, enum: ['income', 'expense'], required: true }, description: { type: String, trim: true, maxlength: 250 }, source: { type: String, trim: true, maxlength: 100 }, date: { type: Date, default: Date.now }, inputMethod: { type: String, enum: ['manual', 'ocr', 'csv', 'ai_assisted'], default: 'manual' }, isRecurring: { type: Boolean, default: false }, recurringType: { type: String, enum: ['daily', 'weekly', 'monthly', null], default: null }, aiSuggestedCategory: { type: objectId, ref: 'Category', default: null }, aiConfidence: Number, isAICategoryAccepted: Boolean, duplicateStatus: { type: String, enum: ['none', 'possible_duplicate', 'confirmed_duplicate'], default: 'none' }, unusuallyLarge: { type: Boolean, default: false }, notes: { type: String, maxlength: 1000 }
}, 'transactions');
Transaction.schema.index({ userId: 1, date: -1 }); Transaction.schema.index({ userId: 1, amount: 1, date: 1 });

export const Budget = named('Budget', { userId: { type: objectId, ref: 'User', required: true }, categoryId: { type: objectId, ref: 'Category', required: true }, month: { type: String, required: true }, limitAmount: { type: Number, required: true, min: 0 }, warningPercentage: { type: Number, default: 80, min: 1, max: 100 } }, 'budgets');
Budget.schema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true });

export const Insight = named('Insight', { userId: { type: objectId, ref: 'User', required: true }, month: String, summaryText: String, tipText: String, flaggedCategories: [{ categoryId: { type: objectId, ref: 'Category' }, percentageChange: Number, reason: String }], aiModel: String, isBookmarked: { type: Boolean, default: false }, generatedAt: { type: Date, default: Date.now } }, 'insights');

export const SavingTip = named('SavingTip', { userId: { type: objectId, ref: 'User', required: true }, title: String, description: String, categoryId: { type: objectId, ref: 'Category' }, potentialSaving: Number, priority: { type: Number, default: 2 }, source: { type: String, enum: ['rule_engine', 'gemini'], required: true }, isPinned: { type: Boolean, default: false }, isDismissed: { type: Boolean, default: false } }, 'savingTips');

export const Notification = named('Notification', { userId: { type: objectId, ref: 'User', required: true }, title: String, message: String, type: { type: String, enum: ['budget_warning', 'budget_exceeded', 'insight', 'duplicate', 'unusual_transaction', 'system'], default: 'system' }, isRead: { type: Boolean, default: false } }, 'notifications');

export const PasswordReset = named('PasswordReset', { userId: { type: objectId, ref: 'User', required: true }, tokenHash: { type: String, required: true, index: true }, expiresAt: { type: Date, required: true, index: { expires: 0 } } }, 'passwordResets');

export const AITrainingData = named('AITrainingData', { userId: { type: objectId, ref: 'User', required: true }, description: String, aiSuggestedCategory: { type: objectId, ref: 'Category' }, correctedCategory: { type: objectId, ref: 'Category' }, accepted: Boolean }, 'aiTrainingData');

export const OCRImport = named('OCRImport', { userId: { type: objectId, ref: 'User', required: true }, fileName: String, extractedText: String, detectedAmount: Number, detectedDescription: String, detectedDate: Date, detectedType: { type: String, enum: ['income', 'expense'] }, detectedCategory: { type: objectId, ref: 'Category' }, ocrStatus: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' }, createdTransactionId: { type: objectId, ref: 'Transaction', default: null } }, 'ocrImports');

export const ActivityLog = named('ActivityLog', { userId: { type: objectId, ref: 'User', required: true }, action: String, entityType: String, entityId: objectId, metadata: Schema.Types.Mixed }, 'activityLogs');

export const Bookmark = named('Bookmark', { userId: { type: objectId, ref: 'User', required: true }, targetType: { type: String, enum: ['savingTip', 'insight'], required: true }, targetId: { type: objectId, required: true }, note: { type: String, maxlength: 500 } }, 'bookmarks');
Bookmark.schema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Announcement = named('Announcement', {
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdBy: { type: objectId, ref: 'User', default: null }
}, 'announcements');

export const TipTemplate = named('TipTemplate', {
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  categoryId: { type: objectId, ref: 'Category', default: null },
  priority: { type: Number, default: 2 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: objectId, ref: 'User', default: null }
}, 'tipTemplates');

export const ChatMessage = named('ChatMessage', {
  userId: { type: objectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 4000 }
}, 'chatMessages');

export const DEFAULT_CATEGORIES = [
  ['Allowance', 'income', 'wallet'], ['Part-time Job', 'income', 'briefcase'], ['Scholarship', 'income', 'graduation-cap'], ['Gift', 'income', 'gift'], ['Other Income', 'income', 'circle-plus'],
  ['Food', 'expense', 'utensils'], ['Transport', 'expense', 'bus'], ['Hostel/Rent', 'expense', 'house'], ['Academics', 'expense', 'book-open'], ['Subscriptions', 'expense', 'repeat-2'], ['Entertainment', 'expense', 'film'], ['Miscellaneous', 'expense', 'more-horizontal']
];