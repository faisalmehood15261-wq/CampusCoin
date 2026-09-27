import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import {
  adminRouter,
  aiRouter,
  announcementRouter,
  bookmarkRouter,
  budgetRouter,
  categoryRouter,
  dashboardRouter,
  insightRouter,
  notificationRouter,
  profileRouter,
  reportRouter,
  tipRouter,
  tipTemplateRouter
} from './routes/coreRoutes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { databaseGate } from './startup.js';

const app = express();

// Own deployments. Kept in code so a stale or missing CLIENT_URL in the host dashboard can
// never lock the shipped frontend out of its own API. Never wildcard a shared host such as
// *.vercel.app here: the session cookie is SameSite=None, so any allowed origin can send
// authenticated requests. Add preview/staging origins through CLIENT_URL instead.
const DEFAULT_ORIGINS = [
  'https://campus-coin-client.vercel.app',
  'https://campus-coin-client.vercel.app',
  'http://localhost:5173'
];

const allowedOrigins = new Set(
  [...DEFAULT_ORIGINS, ...(process.env.CLIENT_URL || '').split(',')]
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Vercel/Netlify terminate TLS in front of the function, so rate limiting and
// secure cookies need the real client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(databaseGate);

app.get('/', (_req, res) => res.json({ success: true, message: 'Campus Coin API' }));
app.get('/api/health', (_req, res) =>
  res.json({
    success: true,
    message: 'Campus Coin API running',
    database: [1, 2].includes(mongoose.connection.readyState) ? 'connected' : 'disconnected'
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRouter);
app.use('/api/budgets', budgetRouter);
app.use('/api/reports', reportRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/profile', profileRouter);
app.use('/api/bookmarks', bookmarkRouter);
app.use('/api/saving-tips', tipRouter);
app.use('/api/tip-templates', tipTemplateRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/insights', insightRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
