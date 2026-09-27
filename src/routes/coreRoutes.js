import { Router } from 'express';
import * as c from '../controllers/coreController.js';
import {
  requireAdmin,
  requireAuth,
} from '../middleware/authMiddleware.js';

const protectedRouter = Router();

protectedRouter.use(requireAuth);

export const categoryRouter = Router();

categoryRouter.use(requireAuth);

categoryRouter.get('/', c.listCategories);
categoryRouter.post('/', c.createCategory);
categoryRouter.put('/:id', c.updateCategory);
categoryRouter.delete('/:id', c.deleteCategory);

export const budgetRouter = Router();

budgetRouter.use(requireAuth);

budgetRouter.get('/', c.listBudgets);
budgetRouter.post('/', c.saveBudget);
budgetRouter.delete('/:id', c.deleteBudget);

export const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.get('/', c.report);
reportRouter.post('/share', c.shareReport);

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/', c.dashboard);

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', c.listNotifications);
notificationRouter.put('/:id', c.readNotification);

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get('/', c.profile);
profileRouter.put('/', c.updateProfile);

export const bookmarkRouter = Router();

bookmarkRouter.use(requireAuth);

bookmarkRouter.get('/', c.listBookmarks);
bookmarkRouter.post('/', c.createBookmark);
bookmarkRouter.delete('/:id', c.deleteBookmark);

export const tipRouter = Router();

tipRouter.use(requireAuth);

tipRouter.get('/', c.listTips);
tipRouter.get('/templates', c.listTipTemplates);
tipRouter.put('/:id/:action', c.tipAction);

export const announcementRouter = Router();

announcementRouter.use(requireAuth);

announcementRouter.get('/', c.listAnnouncements);

export const tipTemplateRouter = Router();

tipTemplateRouter.use(requireAuth);

tipTemplateRouter.get('/', c.listTipTemplates);

export const insightRouter = Router();

insightRouter.use(requireAuth);

insightRouter.get('/', c.listInsights);

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post('/categorize', c.categorize);
aiRouter.post('/categorize-batch', c.categorizeBatch);
aiRouter.post('/monthly-insight', c.monthlyInsight);
aiRouter.get('/chat', c.listChat);
aiRouter.post('/chat', c.aiChat);
aiRouter.delete('/chat', c.clearChat);
aiRouter.post('/corrections', c.createCorrection);

export const adminRouter = Router();

adminRouter.use(
  requireAuth,
  requireAdmin
);

adminRouter.get(
  '/stats',
  c.adminStats
);

adminRouter.get(
  '/users',
  c.adminUsers
);

adminRouter.put(
  '/users/:id/status',
  c.adminUserStatus
);

adminRouter.post(
  '/users/:id/reset',
  c.adminUserReset
);

adminRouter.get(
  '/categories',
  c.adminCategories.list
);

adminRouter.post(
  '/categories',
  c.adminCategories.create
);

adminRouter.put(
  '/categories/:id',
  c.adminCategories.update
);

adminRouter.delete(
  '/categories/:id',
  c.adminCategories.remove
);

adminRouter.get(
  '/tip-templates',
  c.adminTipTemplates.list
);

adminRouter.post(
  '/tip-templates',
  c.adminTipTemplates.create
);

adminRouter.put(
  '/tip-templates/:id',
  c.adminTipTemplates.update
);

adminRouter.delete(
  '/tip-templates/:id',
  c.adminTipTemplates.remove
);

adminRouter.get(
  '/announcements',
  c.adminAnnouncements.list
);

adminRouter.post(
  '/announcements',
  c.adminAnnouncements.create
);

adminRouter.put(
  '/announcements/:id',
  c.adminAnnouncements.update
);

adminRouter.delete(
  '/announcements/:id',
  c.adminAnnouncements.remove
);

export default protectedRouter;