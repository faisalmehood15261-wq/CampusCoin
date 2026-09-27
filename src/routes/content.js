import express from 'express';
import { Announcement, TipTemplate } from '../models/index.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/announcements', protect, async (req, res, next) => {
  try {
    const items = await Announcement.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/tip-templates', protect, async (req, res, next) => {
  try {
    const items = await TipTemplate.find({ isActive: true }).sort({ priority: 1 }).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/announcements', protect, adminOnly, async (req, res, next) => {
  try {
    const items = await Announcement.find().sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/announcements', protect, adminOnly, async (req, res, next) => {
  try {
    const { title, message, status } = req.body;
    if (!title?.trim()) {
      res.status(400);
      throw new Error('Title is required.');
    }
    if (!message?.trim()) {
      res.status(400);
      throw new Error('Message is required.');
    }
    const item = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      status: status === 'inactive' ? 'inactive' : 'active',
      createdBy: req.user?._id || null,
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.put('/admin/announcements/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const { title, message, status } = req.body;
    const item = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title: title?.trim(),
        message: message?.trim(),
        status: status === 'inactive' ? 'inactive' : 'active',
      },
      { new: true, runValidators: true }
    );
    if (!item) {
      res.status(404);
      throw new Error('Announcement not found.');
    }
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/announcements/:id', protect, adminOnly, async (req, res, next) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/tip-templates', protect, adminOnly, async (req, res, next) => {
  try {
    const items = await TipTemplate.find().sort({ priority: 1 }).lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/tip-templates', protect, adminOnly, async (req, res, next) => {
  try {
    const { title, content, priority, isActive } = req.body;
    if (!title?.trim()) {
      res.status(400);
      throw new Error('Title is required.');
    }
    if (!content?.trim()) {
      res.status(400);
      throw new Error('Content is required.');
    }
    const item = await TipTemplate.create({
      title: title.trim(),
      content: content.trim(),
      priority: Number(priority) || 5,
      isActive: isActive !== false,
      createdBy: req.user?._id || null,
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.put('/admin/tip-templates/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const { title, content, priority, isActive } = req.body;
    const item = await TipTemplate.findByIdAndUpdate(
      req.params.id,
      {
        title: title?.trim(),
        content: content?.trim(),
        priority: Number(priority) || 5,
        isActive: isActive !== false,
      },
      { new: true, runValidators: true }
    );
    if (!item) {
      res.status(404);
      throw new Error('Tip template not found.');
    }
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/tip-templates/:id', protect, adminOnly, async (req, res, next) => {
  try {
    await TipTemplate.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;