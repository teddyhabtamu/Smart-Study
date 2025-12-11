import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'FRONTEND_URL',
  'BACKEND_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Environment configuration
export const config = {
  database: {
    url: process.env.DATABASE_URL
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  server: {
    port: parseInt(process.env.PORT || '5000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL,
    backendUrl: process.env.BACKEND_URL
  },
  fileUpload: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    uploadPath: process.env.UPLOAD_PATH || 'uploads/'
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY
  },
  email: {
    brevo: {
      apiKey: process.env.BREVO_API_KEY
    },
    sender: {
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@smartstudy.com',
      name: process.env.BREVO_SENDER_NAME || 'SmartStudy'
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@smartstudy.com'
  }
};
