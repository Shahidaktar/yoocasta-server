import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { ApiResponse } from '../utils/apiResponse';

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    if (!roles.includes(req.user.role)) {
      return ApiResponse.error(res, 'Forbidden — insufficient permissions', 403);
    }

    next();
  };
};

export const authorizeSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return ApiResponse.error(res, 'Unauthorized', 401);
  }

  if (req.user.role !== 'ADMIN' || req.user.adminRole !== 'SUPER_ADMIN') {
    return ApiResponse.error(res, 'Forbidden — super admin only', 403);
  }

  next();
};

export const authorizeAdminTab = (tabKey: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized', 401);
    }

    if (req.user.role !== 'ADMIN') {
      return ApiResponse.error(res, 'Forbidden', 403);
    }

    if (req.user.adminRole === 'SUPER_ADMIN') {
      return next();
    }

    const perms = req.user.permissions || [];
    if (!perms.includes(tabKey)) {
      return ApiResponse.error(res, 'Forbidden — no access to this section', 403);
    }

    next();
  };
};