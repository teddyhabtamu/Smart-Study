import { User } from './index';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

// Custom request types for better type safety
export interface AuthenticatedRequest extends Express.Request {
  user: User;
}

export interface OptionalAuthRequest extends Express.Request {
  user?: User;
}