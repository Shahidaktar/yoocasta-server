import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
import talentRoutes from './modules/talent/talent.routes';
import recruiterRoute from './modules/recruiter/recruiter.route';
import jobRoutes from './modules/jobs/job.routes';
import applicationRoutes from './modules/applications/application.routes';
import favouriteRoutes from './modules/favourites/favourite.routes';
import invitationRoutes from './modules/invitations/invitation.routes';
import blogRoutes from './modules/blogs/blog.routes';
import planRoutes from './modules/plans/plan.routes';
import contactRoutes from './modules/contact/contact.routes';
import adminRoutes from './modules/admin/admin.routes';
import * as castBagController from './modules/recruiter/castBag.controller';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// Auth rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later' },
});
app.use('/api/v1/auth', authLimiter);

// Routes
app.use('/api/v1/auth', authRoutes);

app.use('/api/v1/profile', profileRoutes);

app.use('/api/v1/talents', talentRoutes);

app.use('/api/v1/recruiter', recruiterRoute);

app.use('/api/v1/jobs', jobRoutes);

app.use('/api/v1/applications', applicationRoutes);

app.use('/api/v1/favourites', favouriteRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/blogs', blogRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/admin', adminRoutes);

app.get('/api/v1/cast-bags/public/:token', castBagController.getPublic);

app.get('/api/v1/filter-options', (req, res) => {
  try {
    const filterPath = path.join(__dirname, '../../frontend/public/static/filterOptions.json');
    const data = fs.readFileSync(filterPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: 'Failed to load filter options' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

export default app;