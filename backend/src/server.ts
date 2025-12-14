import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from './middleware/googleAuth';
import { config } from './config';
import { SchedulerService } from './services/schedulerService';

const app = express();

// Trust proxy - Required for Vercel and other reverse proxies
// This allows Express to correctly identify the client IP from X-Forwarded-For headers
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173', // Development frontend
  'https://smart-study-navy.vercel.app', // Production frontend (old)
  'https://smartstudy.tewodroshabtamu.me', // Production frontend (new)
  ...(config.server.frontendUrl && config.server.frontendUrl !== 'http://localhost:5173'
    ? [config.server.frontendUrl]
    : [])
];

// CORS middleware with explicit OPTIONS handling
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests) - but only in development
    if (!origin) {
      if (config.server.nodeEnv === 'development') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS: No origin header'));
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours - cache preflight requests
}));

// Explicit OPTIONS handler for all API routes (additional safety for Vercel)
app.options('/api/*', (req, res) => {
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
  } else {
    res.status(403).json({
      success: false,
      message: 'Not allowed by CORS'
    });
  }
});

// Passport middleware
app.use(passport.initialize());

// Rate limiting (disabled in development)
if (config.server.nodeEnv === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    // Custom key generator to properly handle forwarded headers
    // With trust proxy enabled, req.ip automatically uses X-Forwarded-For
    keyGenerator: (req) => {
      // Strip port numbers if present (some proxies include IP:PORT format)
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return ip.replace(/:\d+[^:]*$/, '');
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Disable validation warnings - we've properly configured trust proxy above
    validate: {
      xForwardedForHeader: false, // We handle this with trust proxy
      forwardedHeader: false // We handle this with trust proxy
    }
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
import careersRoutes from './routes/careers';

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
app.use('/api/careers', careersRoutes);

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

  // Start the notification scheduler
  SchedulerService.start();
});

export default app;
