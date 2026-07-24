import { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service';
import { ApiResponse } from '../../utils/apiResponse';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return ApiResponse.error(res, 'Email and password are required', 400);
    }
    const result = await adminService.login(email, password);
    return ApiResponse.success(res, result, 'Admin login successful');
  } catch (err) {
    next(err);
  }
};

export const getTalents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    const result = await adminService.getTalents(page, limit, status);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateTalentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const status = req.body.status as string;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return ApiResponse.error(res, 'Status must be ACTIVE or INACTIVE', 400);
    }
    const result = await adminService.updateTalentStatus(id, status as 'ACTIVE' | 'INACTIVE');
    return ApiResponse.success(res, result, 'Status updated');
  } catch (err) {
    next(err);
  }
};
