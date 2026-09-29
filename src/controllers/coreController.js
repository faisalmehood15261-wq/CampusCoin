import crypto from 'node:crypto';
import mongoose from 'mongoose';

import {
  Announcement,
  AITrainingData,
  Bookmark,
  Budget,
  Category,
  ChatMessage,
  Insight,
  Notification,
  SavingTip,
  TipTemplate,
  Transaction,
  User,
  ActivityLog,
} from '../models/index.js';

import {
  asyncHandler,
  cleanUser,
  fail,
  monthKey,
} from '../utils/http.js';

import { transactionSummary } from '../services/financeService.js';
import { askGemini } from '../services/geminiService.js';
import { sendMail } from '../services/emailService.js';

const own = (Model, id, userId) =>
  Model.findOne({
    _id: id,
    userId,
  });

export const listAnnouncements = asyncHandler(async (_req, res) => {
  const items = await Announcement.find({
    status: 'active',
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    items,
  });
});

export const listTipTemplates = asyncHandler(async (_req, res) => {
  const items = await TipTemplate.find({
    isActive: true,
  })
    .populate('categoryId', 'name icon')
    .sort({
      priority: 1,
      createdAt: -1,
    })
    .lean();

  res.json({
    success: true,
    items,
  });
});

export const listCategories = asyncHandler(async (req, res) => {
  const items = await Category.find({
    $or: [
      { userId: req.user._id },
      { isDefault: true },
    ],
  })
    .sort({ type: 1, name: 1 })
    .lean();

  res.json({
    success: true,
    items,
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, type, icon } = req.body;

  if (
    !name ||
    !['income', 'expense'].includes(type)
  ) {
    throw fail('Name and a valid category type are required.');
  }

  if (
    await Category.exists({
      name: new RegExp(`^${name.trim()}$`, 'i'),
      type,
      $or: [
        { userId: req.user._id },
        { isDefault: true },
      ],
    })
  ) {
    throw fail('A category with this name already exists.', 409);
  }

  res.status(201).json({
    success: true,
    item: await Category.create({
      name,
      type,
      icon,
      userId: req.user._id,
    }),
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const item = await own(
    Category,
    req.params.id,
    req.user._id
  );

  if (!item) {
    throw fail('Personal category not found.', 404);
  }

  Object.assign(item, {
    name: req.body.name || item.name,
    icon: req.body.icon || item.icon,
  });

  await item.save();

  res.json({
    success: true,
    item,
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const item = await own(
    Category,
    req.params.id,
    req.user._id
  );

  if (!item) {
    throw fail('Personal category not found.', 404);
  }

  if (
    await Transaction.exists({
      userId: req.user._id,
      categoryId: item._id,
    })
  ) {
    throw fail(
      'This category has transactions and cannot be removed.',
      409
    );
  }

  await Budget.deleteMany({
    userId: req.user._id,
    categoryId: item._id,
  });

  await item.deleteOne();

  res.json({ success: true });
});

export const listBudgets = asyncHandler(async (req, res) => {
  const month = req.query.month || monthKey();

  const budgets = await Budget.find({
    userId: req.user._id,
    month,
  }).populate('categoryId', 'name icon');

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const spend = await Transaction.aggregate([
    {
      $match: {
        userId: req.user._id,
        type: 'expense',
        date: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        spent: { $sum: '$amount' },
      },
    },
  ]);

  const map = Object.fromEntries(
    spend
      .filter(x => x._id)
      .map(x => [x._id.toString(), x.spent])
  );

  const orphanIds = budgets
    .filter(b => !b.categoryId)
    .map(b => b._id);

  if (orphanIds.length) {
    Budget.deleteMany({ _id: { $in: orphanIds } }).catch(() => {});
  }

  const items = budgets
    .filter(b => b.categoryId)
    .map(b => ({
      ...b.toObject(),
      spent: map[b.categoryId._id.toString()] || 0,
    }));

  res.json({
    success: true,
    items,
  });
});

export const saveBudget = asyncHandler(async (req, res) => {
  const {
    categoryId,
    month = monthKey(),
    limitAmount,
    warningPercentage = 80,
  } = req.body;

  const category = await Category.findOne({
    _id: categoryId,
    type: 'expense',
    $or: [
      { userId: req.user._id },
      { isDefault: true },
    ],
  });

  if (!category || !(Number(limitAmount) >= 0)) {
    throw fail('A valid expense category and limit are required.');
  }

  const item = await Budget.findOneAndUpdate(
    {
      userId: req.user._id,
      categoryId,
      month,
    },
    {
      limitAmount: Number(limitAmount),
      warningPercentage: Number(warningPercentage),
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).populate('categoryId', 'name icon');

  res.json({
    success: true,
    item,
  });
});

export const deleteBudget = asyncHandler(async (req, res) => {
  const item = await Budget.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!item) {
    throw fail('Budget not found.', 404);
  }

  res.json({ success: true });
});

export const dashboard = asyncHandler(async (req, res) => {
  const month = req.query.month || monthKey();

  const summary = await transactionSummary(
    req.user._id,
    month
  );

  const [budgets, recent, notifications, tips, announcements, campusTips, dailyActivity] =
    await Promise.all([
      Budget.find({
        userId: req.user._id,
        month,
      }).populate('categoryId', 'name icon'),

      Transaction.find({ userId: req.user._id })
        .populate('categoryId', 'name icon')
        .sort({ date: -1 })
        .limit(5),

      Notification.find({
        userId: req.user._id,
        isRead: false,
      })
        .sort({ createdAt: -1 })
        .limit(4),

      SavingTip.find({
        userId: req.user._id,
        isDismissed: false,
      })
        .sort({ isPinned: -1, priority: -1 })
        .limit(3),

      Announcement.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      TipTemplate.find({ isActive: true })
        .populate('categoryId', 'name icon')
        .sort({ priority: 1, createdAt: -1 })
        .limit(5)
        .lean(),

      Transaction.aggregate([
        {
          $match: {
            userId: req.user._id,
            date: { $gte: summary.start, $lt: summary.end },
          },
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
              type: '$type',
            },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.day': 1 } },
      ]),
    ]);

  const spending = Object.fromEntries(
    summary.categories
      .filter(c => c._id)
      .map(c => [c._id.toString(), c.total])
  );

  const orphanIds = budgets
    .filter(b => !b.categoryId)
    .map(b => b._id);

  if (orphanIds.length) {
    Budget.deleteMany({ _id: { $in: orphanIds } }).catch(() => {});
  }

  const budgetCards = budgets
    .filter(b => b.categoryId && b.categoryId._id)
    .map(b => ({
      ...b.toObject(),
      spent: spending[b.categoryId._id.toString()] || 0,
    }));

  const lastMonth = new Date(`${month}-01T00:00:00.000Z`);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const last = await transactionSummary(
    req.user._id,
    monthKey(lastMonth)
  );

  res.json({
    success: true,
    month,
    summary: {
      ...summary,
      categories: summary.categories
        .filter(c => c.category && c._id)
        .map(c => ({
          name: c.category.name,
          icon: c.category.icon,
          amount: c.total,
          id: c._id,
        })),
      savingsRate: summary.income
        ? Math.max(
            0,
            ((summary.income - summary.expense) /
              summary.income) *
              100
          )
        : 0,
      expenseChange: last.expense
        ? ((summary.expense - last.expense) / last.expense) *
          100
        : null,
    },
    budgetCards,
    dailyActivity,
    recent,
    notifications,
    tips,
    announcements,
    campusTips,
    forecast: {
      nextMonthExpense: last.expense
        ? Math.round(
            (summary.expense * 0.7 + last.expense * 0.3) * 100
          ) / 100
        : summary.expense,
      method: 'weighted two-month average',
    },
  });
});

export const report = asyncHandler(async (req, res) => {
  const month = req.query.month || monthKey();

  const summary = await transactionSummary(
    req.user._id,
    month
  );

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const daily = await Transaction.aggregate([
    {
      $match: {
        userId: req.user._id,
        date: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: {
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
            },
          },
          type: '$type',
        },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.day': 1 } },
  ]);

  res.json({
    success: true,
    month,
    summary: {
      income: summary.income,
      expense: summary.expense,
      balance: summary.balance,
      categories: summary.categories
        .filter(c => c.category && c._id)
        .map(c => ({
          name: c.category.name,
          amount: c.total,
        })),
    },
    daily,
  });
});

export const shareReport = asyncHandler(async (req, res) => {
  const { email, month = monthKey() } = req.body;

  if (!email) {
    throw fail('Recipient email is required.');
  }

  const result = await transactionSummary(
    req.user._id,
    month
  );

  await sendMail({
    to: email,
    subject: `Campus Coin report — ${month}`,
    text: `Income: ${result.income}\nExpenses: ${result.expense}\nBalance: ${result.balance}`,
    html: `
      <h2>Campus Coin report: ${month}</h2>
      <p>Income: <b>${result.income}</b></p>
      <p>Expenses: <b>${result.expense}</b></p>
      <p>Balance: <b>${result.balance}</b></p>
    `,
  });

  res.json({ success: true });
});

export const listNotifications = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    items: await Notification.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(100),
  })
);

export const readNotification = asyncHandler(async (req, res) => {
  const item = await own(
    Notification,
    req.params.id,
    req.user._id
  );

  if (!item) {
    throw fail('Notification not found.', 404);
  }

  item.isRead = req.body.isRead ?? true;
  await item.save();

  res.json({
    success: true,
    item,
  });
});

export const profile = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    user: cleanUser(req.user),
    activity: await ActivityLog.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(20),
  })
);

export const updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    academicYear,
    monthlyAllowance,
    savingsGoal,
    avatar,
  } = req.body;

  Object.assign(req.user, {
    ...(name && { name }),
    ...(academicYear !== undefined && { academicYear }),
    ...(monthlyAllowance !== undefined && {
      monthlyAllowance: Number(monthlyAllowance) || 0,
    }),
    ...(savingsGoal !== undefined && {
      savingsGoal: Number(savingsGoal) || 0,
    }),
    ...(avatar !== undefined && { avatar }),
  });

  await req.user.save();

  res.json({
    success: true,
    user: cleanUser(req.user),
  });
});

export const listBookmarks = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    items: await Bookmark.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 }),
  })
);

export const createBookmark = asyncHandler(async (req, res) => {
  const { targetType, targetId, note } = req.body;

  if (
    !['savingTip', 'insight'].includes(targetType) ||
    !targetId
  ) {
    throw fail('A bookmark target is required.');
  }

  const item = await Bookmark.findOneAndUpdate(
    {
      userId: req.user._id,
      targetType,
      targetId,
    },
    { note },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );

  res.status(201).json({
    success: true,
    item,
  });
});

export const deleteBookmark = asyncHandler(async (req, res) => {
  await Bookmark.deleteOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  res.json({ success: true });
});

export const listTips = asyncHandler(async (req, res) => {
  let tips = await SavingTip.find({
    userId: req.user._id,
    isDismissed: false,
  })
    .populate('categoryId', 'name icon')
    .sort({
      isPinned: -1,
      priority: -1,
      createdAt: -1,
    });

  if (!tips.length) {
    const summary = await transactionSummary(req.user._id);

    if (summary.categories.length) {
      const top = summary.categories[0];

      tips = [
        await SavingTip.create({
          userId: req.user._id,
          title: `Trim your ${top.category.name} spend`,
          description: `${top.category.name} is your highest recorded expense this month. Set a small weekly limit and review it before your next purchase.`,
          categoryId: top._id,
          potentialSaving:
            Math.round(top.total * 0.1 * 100) / 100,
          priority: 1,
          source: 'rule_engine',
        }),
      ];
    }
  }

  res.json({
    success: true,
    items: tips,
  });
});

export const tipAction = asyncHandler(async (req, res) => {
  const tip = await own(
    SavingTip,
    req.params.id,
    req.user._id
  );

  if (!tip) {
    throw fail('Saving tip not found.', 404);
  }

  if (req.params.action === 'pin') {
    tip.isPinned = !tip.isPinned;
  } else if (req.params.action === 'dismiss') {
    tip.isDismissed = true;
  } else {
    throw fail('Unknown action.');
  }

  await tip.save();

  res.json({
    success: true,
    item: tip,
  });
});

export const listInsights = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    items: await Insight.find({
      userId: req.user._id,
    }).sort({ generatedAt: -1 }),
  })
);

export const clearInsights = asyncHandler(async (req, res) => {
  await Promise.all([
    Insight.deleteMany({ userId: req.user._id }),
    Bookmark.deleteMany({ userId: req.user._id, targetType: 'insight' }),
  ]);

  res.json({ success: true });
});

const ownDataPrompt = async (userId, month) => {
  const summary = await transactionSummary(userId, month);

  const categories =
    summary.categories
      .filter(c => c.category)
      .map(c => `${c.category.name}: ${c.total}`)
      .join(', ') || 'No expenses recorded';

  return {
    summary,
    text: `The student’s ${month} personal records: income ${summary.income}; expenses ${summary.expense}; balance ${summary.balance}; expense categories: ${categories}.`,
  };
};

const safeParseJSON = raw => {
  if (!raw) return null;

  const cleaned = String(raw)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        return null;
      }
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
};

const ruleBasedCategorize = (description, categories) => {
  const desc = (description || '').toLowerCase();

  const match = categories.find(c => {
    const name = c.name.toLowerCase();

    if (name.includes('food') || name.includes('dining')) {
      return /coffee|cafe|pizza|burger|subway|mcdonald|food|lunch|dinner|restaurant|swiggy|zomato|kfc/i.test(
        desc
      );
    }
    if (name.includes('transport')) {
      return /uber|careem|bus|train|cab|fuel|petrol|bike|rickshaw|metro|flight/i.test(
        desc
      );
    }
    if (name.includes('hostel') || name.includes('rent')) {
      return /rent|hostel|room|landlord|apartment|housing/i.test(
        desc
      );
    }
    if (name.includes('academic') || name.includes('books')) {
      return /book|course|udemy|tuition|exam|photocopy|stationery|library|fee/i.test(
        desc
      );
    }
    if (name.includes('subscription')) {
      return /netflix|spotify|youtube|apple|google|cloud|prime|patreon/i.test(
        desc
      );
    }
    if (name.includes('entertainment')) {
      return /movie|cinema|game|steam|playstation|event|concert|party/i.test(
        desc
      );
    }
    return name === desc;
  });

  const category = match || categories[0];

  return JSON.stringify({
    category: category?.name || 'Miscellaneous',
    confidence: match ? 0.9 : 0.6,
  });
};

export const categorize = asyncHandler(async (req, res) => {
  const { description, amount, type = 'expense' } = req.body;

  if (!description) {
    throw fail('Description is required.');
  }

  const categories = await Category.find({
    type,
    $or: [
      { userId: req.user._id },
      { isDefault: true },
    ],
  });

  const training = await AITrainingData.find({
    userId: req.user._id,
  })
    .populate('correctedCategory', 'name')
    .sort({ createdAt: -1 })
    .limit(10);

  const fallback = () =>
    ruleBasedCategorize(description, categories);

  let result;
  try {
    result = await askGemini(
      `Return ONLY JSON with keys category and confidence. Categorize this ${type}: description=${description}, amount=${amount || 'unknown'}. Available categories: ${categories
        .map(c => c.name)
        .join(', ')}. User corrections: ${
        training
          .map(t => `${t.description} => ${t.correctedCategory?.name}`)
          .join('; ') || 'none'
      }.`,
      { fallbackHandler: fallback }
    );
  } catch {
    result = fallback();
  }

  const parsed = safeParseJSON(result);

  if (!parsed || !parsed.category) {
    const fb = safeParseJSON(fallback());
    if (!fb) {
      throw fail('Unable to categorize this description.', 502);
    }
    const category = categories.find(
      c =>
        c.name.toLowerCase() ===
        String(fb.category).toLowerCase()
    );
    return res.json({
      success: true,
      suggestion: {
        categoryId: category?._id || categories[0]?._id,
        categoryName: category?.name || categories[0]?.name,
        confidence: Number(fb.confidence) || 0.6,
      },
    });
  }

  const category = categories.find(
    c =>
      c.name.toLowerCase() ===
      String(parsed.category).toLowerCase()
  );

  if (!category) {
    const fb = safeParseJSON(fallback());
    const fallbackCategory = categories.find(
      c =>
        c.name.toLowerCase() ===
        String(fb?.category).toLowerCase()
    );

    return res.json({
      success: true,
      suggestion: {
        categoryId: fallbackCategory?._id || categories[0]?._id,
        categoryName:
          fallbackCategory?.name || categories[0]?.name,
        confidence: Number(fb?.confidence) || 0.6,
      },
    });
  }

  res.json({
    success: true,
    suggestion: {
      categoryId: category._id,
      categoryName: category.name,
      confidence: Number(parsed.confidence) || 0,
    },
  });
});

export const categorizeBatch = asyncHandler(async (req, res) => {
  const { items } = req.body;

  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 50
  ) {
    throw fail('Supply 1–50 transactions.');
  }

  const categories = await Category.find({
    type: 'expense',
    $or: [
      { userId: req.user._id },
      { isDefault: true },
    ],
  });

  const fallback = () =>
    JSON.stringify(
      items.map((x, index) => {
        const parsed = JSON.parse(
          ruleBasedCategorize(x.description, categories)
        );
        return {
          index,
          category: parsed.category,
          confidence: parsed.confidence,
        };
      })
    );

  let output;
  try {
    output = await askGemini(
      `For every item, return ONLY a JSON array of objects with index, category, confidence. Categories: ${categories
        .map(c => c.name)
        .join(', ')}. Items: ${JSON.stringify(
        items.map((x, index) => ({
          index,
          description: x.description,
          amount: x.amount,
        }))
      )}`,
      { fallbackHandler: fallback }
    );
  } catch {
    output = fallback();
  }

  let parsed = safeParseJSON(output);

  if (!Array.isArray(parsed)) {
    parsed = safeParseJSON(fallback());
  }

  if (!Array.isArray(parsed)) {
    throw fail('Unable to process batch categorization.', 502);
  }

  res.json({
    success: true,
    suggestions: parsed.map(x => ({
      ...x,
      categoryId:
        categories.find(
          c =>
            c.name.toLowerCase() ===
            String(x.category).toLowerCase()
        )?._id || null,
    })),
  });
});

export const monthlyInsight = asyncHandler(async (req, res) => {
  const month = req.body.month || monthKey();

  const data = await ownDataPrompt(req.user._id, month);

  const fallback = () => {
    const top = data.summary.categories[0];
    const topText = top
      ? `${top.category.name} (${top.total}) was your highest expense this month.`
      : 'No major expenses recorded.';

    return `Monthly Financial Overview (${month}): Total Income: ${data.summary.income}, Total Expenses: ${data.summary.expense}, Remaining Balance: ${data.summary.balance}.\n\nKey Observation: ${topText}\n\nPractical Tip: Keep an eye on non-essential spending during mid-semester to maintain a healthy savings buffer.`;
  };

  let text;
  let aiModel = 'rule-based';
  try {
    text = await askGemini(
      `You are Campus Coin's educational financial assistant. Analyze only this student's own financial data and provide a concise monthly summary plus one practical saving tip. Never present certified financial advice. ${data.text}`,
      {
        fallbackHandler: fallback,
        onProvider: ({ provider, model }) => {
          aiModel = provider === 'rules' ? 'rule-based' : `${provider}/${model}`;
        },
      }
    );
  } catch {
    text = fallback();
  }

  const item = await Insight.create({
    userId: req.user._id,
    month,
    summaryText: text,
    tipText: 'AI-generated educational guidance',
    aiModel,
  });

  await Notification.create({
    userId: req.user._id,
    type: 'insight',
    title: 'New monthly insight',
    message: 'Your personalized spending insight is ready.',
  });

  res.status(201).json({
    success: true,
    item,
  });
});

export const aiChat = asyncHandler(async (req, res) => {
  const { message, month = monthKey() } = req.body;

  if (!message || message.length > 1000) {
    throw fail('Ask a question up to 1,000 characters.');
  }

  const data = await ownDataPrompt(req.user._id, month);

  const fallback = () =>
    `Based on your ${month} records: Your total income is PKR ${data.summary.income}, total expenses are PKR ${data.summary.expense}, leaving a current balance of PKR ${data.summary.balance}. Top spending categories: ${
      data.summary.categories
        .filter(c => c.category)
        .map(c => `${c.category.name} (${c.total})`)
        .join(', ') || 'None'
    }.`;

  let answer;
  let aiFailed = false;
  let aiErrorDetail = '';
  let aiProvider = 'rules';

  try {
    answer = await askGemini(
      `You are Campus Coin, an educational student-finance assistant. Answer using only these personal records and this question. Do not invent data or claim certified financial advice. ${data.text}\nQuestion: ${message}`,
      {
        fallbackHandler: fallback,
        onProvider: ({ provider }) => {
          aiProvider = provider;
        },
      }
    );
  } catch (err) {
    console.error('[aiChat] askGemini threw:', err);
    aiFailed = true;
    aiErrorDetail = err?.message || 'Unknown Gemini error';
    answer = fallback();
  }

  await ChatMessage.create([
    {
      userId: req.user._id,
      role: 'user',
      content: message.slice(0, 4000),
    },
    {
      userId: req.user._id,
      role: 'assistant',
      content: answer.slice(0, 4000),
    },
  ]);

  res.json({
    success: true,
    answer,
    aiProvider,
    aiFailed,
    aiErrorDetail,
    disclaimer:
      'Educational guidance only — not certified financial advice.',
  });
});

export const listChat = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    items: await ChatMessage.find({
      userId: req.user._id,
    })
      .sort({ createdAt: 1 })
      .limit(150)
      .lean(),
  })
);

export const clearChat = asyncHandler(async (req, res) => {
  await ChatMessage.deleteMany({
    userId: req.user._id,
  });

  res.json({ success: true });
});

export const createCorrection = asyncHandler(async (req, res) => {
  const {
    description,
    aiSuggestedCategory,
    correctedCategory,
    accepted,
  } = req.body;

  if (!description || !correctedCategory) {
    throw fail(
      'Description and corrected category are required.'
    );
  }

  const item = await AITrainingData.create({
    userId: req.user._id,
    description,
    aiSuggestedCategory,
    correctedCategory,
    accepted,
  });

  res.status(201).json({
    success: true,
    item,
  });
});

export const adminStats = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    activeUsers,
    totalTransactions,
    allCategories,
    usageAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Transaction.countDocuments(),
    Category.find({ isDefault: true })
      .select('name type icon')
      .lean(),
    Transaction.aggregate([
      { $match: { categoryId: { $ne: null } } },
      { $group: { _id: '$categoryId', uses: { $sum: 1 } } },
    ]),
  ]);

  const usageMap = new Map(
    usageAgg.map(u => [String(u._id), u.uses])
  );

  const categories = allCategories
    .map(c => ({
      _id: c._id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      uses: usageMap.get(String(c._id)) || 0,
    }))
    .sort((a, b) => b.uses - a.uses);

  res.json({
    success: true,
    totalUsers,
    activeUsers,
    disabledUsers: totalUsers - activeUsers,
    totalTransactions,
    categories,
  });
});

export const adminUsers = asyncHandler(async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .limit(200);

  const items = users.map(user => ({
    ...cleanUser(user),
    _id: user._id.toString(),
  }));

  res.json({
    success: true,
    items,
  });
});

export const adminUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !mongoose.isValidObjectId(id)) {
    throw fail('Invalid user ID.', 400);
  }

  const user = await User.findById(id);

  if (!user) {
    throw fail('User not found.', 404);
  }

  if (user._id.equals(req.user._id)) {
    throw fail('You cannot change your own account status.');
  }

  if (typeof req.body.isActive !== 'boolean') {
    throw fail('isActive must be true or false.', 400);
  }

  user.isActive = req.body.isActive;
  await user.save();

  res.json({
    success: true,
    message: user.isActive
      ? 'User account enabled successfully.'
      : 'User account disabled successfully.',
    user: {
      ...cleanUser(user),
      _id: user._id.toString(),
    },
  });
});

export const adminUserReset = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || !mongoose.isValidObjectId(id)) {
    throw fail('Invalid user ID.', 400);
  }

  const user = await User.findById(id);

  if (!user) {
    throw fail('User not found.', 404);
  }

  if (user._id.equals(req.user._id)) {
    throw fail('You cannot reset your own account.');
  }

  user.isActive = false;
  await user.save();

  res.json({
    success: true,
    message:
      'User account reset successfully. Account is now inactive.',
    user: {
      ...cleanUser(user),
      _id: user._id.toString(),
    },
  });
});

const adminCrud = (Model, allowed) => ({
  list: asyncHandler(async (_req, res) =>
    res.json({
      success: true,
      items: await Model.find().sort({ createdAt: -1 }),
    })
  ),

  create: asyncHandler(async (req, res) => {
    const data = Object.fromEntries(
      Object.entries(req.body).filter(([key]) =>
        allowed.includes(key)
      )
    );

    if ('createdBy' in Model.schema.paths) {
      data.createdBy = req.user._id;
    }

    res.status(201).json({
      success: true,
      item: await Model.create(data),
    });
  }),

  update: asyncHandler(async (req, res) => {
    const data = Object.fromEntries(
      Object.entries(req.body).filter(([key]) =>
        allowed.includes(key)
      )
    );

    const item = await Model.findByIdAndUpdate(
      req.params.id,
      data,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!item) {
      throw fail('Item not found.', 404);
    }

    res.json({
      success: true,
      item,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const item = await Model.findByIdAndDelete(req.params.id);

    if (!item) {
      throw fail('Item not found.', 404);
    }

    res.json({ success: true });
  }),
});

export const adminCategories = {
  ...adminCrud(Category, ['name', 'type', 'icon', 'isDefault']),

  remove: asyncHandler(async (req, res) => {
    const item = await Category.findById(req.params.id);

    if (!item) {
      throw fail('Category not found.', 404);
    }

    await Transaction.updateMany(
      { categoryId: item._id },
      { $set: { categoryId: null } }
    );

    await Budget.deleteMany({ categoryId: item._id });

    await Category.findByIdAndDelete(item._id);

    res.json({ success: true });
  }),
};

export const adminTipTemplates = adminCrud(TipTemplate, [
  'title',
  'content',
  'description',
  'categoryId',
  'priority',
  'isActive',
  'status',
]);

export const adminAnnouncements = adminCrud(Announcement, [
  'title',
  'message',
  'status',
]);
