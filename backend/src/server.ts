import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173', // Development frontend
  'https://smart-study-navy.vercel.app', // Production frontend
  ...(config.server.frontendUrl && config.server.frontendUrl !== 'http://localhost:5173'
    ? [config.server.frontendUrl]
    : [])
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting (disabled in development)
if (config.server.nodeEnv === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api/', limiter);
} else {
  console.log('📊 Rate limiting disabled in development mode');
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});


// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import documentRoutes from './routes/documents';
import videoRoutes from './routes/videos';
import forumRoutes from './routes/forum';
import aiTutorRoutes from './routes/ai-tutor';
import plannerRoutes from './routes/planner';
import adminRoutes from './routes/admin';
import dashboardRoutes from './routes/dashboard';
import searchRoutes from './routes/search';

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/ai-tutor', aiTutorRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'SmartStudy API is running',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.error('Error:', err);

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON payload'
    });
    return;
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

app.listen(config.server.port, () => {
  console.log(`🚀 SmartStudy API server running on port ${config.server.port}`);
  console.log(`📊 Environment: ${config.server.nodeEnv}`);
});

export default app;
