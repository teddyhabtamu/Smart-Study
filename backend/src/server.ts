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

// CORS configuration - MUST be before other middleware
const allowedOrigins = [
  'http://localhost:5173', // Development frontend
  'https://smart-study-navy.vercel.app', // Production frontend (old)
  'https://smart-study-ncwi.vercel.app', // Production frontend (current)
  'https://smartstudy.tewodroshabtamu.me', // Production frontend (new)
  ...(config.server.frontendUrl && config.server.frontendUrl !== 'http://localhost:5173'
    ? [config.server.frontendUrl]
    : [])
];

// CORS middleware - handles preflight OPTIONS automatically
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
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
  maxAge: 86400, // 24 hours - cache preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// CORS middleware - but allow OAuth routes and image-proxy to pass through
app.use((req, res, next) => {
  // Skip CORS for OAuth routes - they're server-side redirects
  // Skip CORS for image-proxy - it's a public resource that should be accessible from anywhere
  const path = req.path || req.url?.split('?')[0] || '';
  if (path.includes('/auth/google') || path.includes('/google') || path.includes('/image-proxy')) {
    return next();
  }
  // Apply CORS for all other routes
  cors(corsOptions)(req, res, next);
});

// Explicit OPTIONS handler for all API routes (catch-all for Vercel)
// Use a middleware function instead of app.options('*') which doesn't work in Express 5
app.use((req, res, next) => {
  // Skip OPTIONS handling for OAuth routes and image-proxy (public resource)
  const path = req.path || req.url?.split('?')[0] || '';
  if (path.includes('/auth/google') || path.includes('/google')) {
    return next();
  }
  
  // For image-proxy, allow all origins (it's a public resource)
  if (path.includes('/image-proxy') && req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }
  
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.status(204).end();
      return;
    } else if (!origin && config.server.nodeEnv === 'development') {
      // Allow in development
      res.status(204).end();
      return;
    } else {
      res.status(403).json({
        success: false,
        message: 'Not allowed by CORS'
      });
      return;
    }
  }
  next();
});

// Security middleware - configured to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

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

// Error handling middleware - ensure CORS headers on errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.error('Error:', err);

  // Set CORS headers on error responses
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON payload'
    });
    return;
  }

  // Handle CORS errors
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      success: false,
      message: err.message
    });
    return;
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler - ensure CORS headers on 404
app.use((req, res) => {
  // Set CORS headers on 404 responses
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Only start the server if NOT in serverless environment (Vercel)
// Vercel sets VERCEL=1 environment variable
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

if (!isVercel) {
  // Traditional server mode - start listening
  app.listen(config.server.port, () => {
    console.log(`🚀 SmartStudy API server running on port ${config.server.port}`);
    console.log(`📊 Environment: ${config.server.nodeEnv}`);

    // Start the notification scheduler (only in traditional server mode)
    // In serverless, use Vercel Cron Jobs or similar for scheduled tasks
    SchedulerService.start();
  });
} else {
  console.log('🚀 Running in Vercel serverless mode');
  // Don't start scheduler in serverless - use Vercel Cron Jobs instead
}

// Export the app for Vercel serverless functions
export default app;
