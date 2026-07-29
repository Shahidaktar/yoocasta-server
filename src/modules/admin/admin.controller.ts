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
    const search = req.query.search as string | undefined;
    const result = await adminService.getTalents(page, limit, status, search);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const verifyFilter = req.query.verifyFilter as string | undefined;
    const result = await adminService.getCompanies(page, limit, search, verifyFilter);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getTalentSubscriptionDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.getTalentSubscriptionDetails(id);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateCompanyVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const isVerified = req.body.isVerified as boolean;
    if (typeof isVerified !== 'boolean') {
      return ApiResponse.error(res, 'isVerified must be a boolean', 400);
    }
    const result = await adminService.updateCompanyVerify(id, isVerified);
    return ApiResponse.success(res, result, 'Verification status updated');
  } catch (err) {
    next(err);
  }
};

export const updateCompanyStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const status = req.body.status as string;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return ApiResponse.error(res, 'Status must be ACTIVE or INACTIVE', 400);
    }
    const result = await adminService.updateCompanyStatus(id, status as 'ACTIVE' | 'INACTIVE');
    return ApiResponse.success(res, result, 'Status updated');
  } catch (err) {
    next(err);
  }
};

export const getActiveCompanies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminService.getActiveCompanies();
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const adminCreateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyId, ...jobData } = req.body;
    if (!companyId) return ApiResponse.error(res, 'companyId is required', 400);
    const result = await adminService.adminCreateJob(companyId, jobData);
    return ApiResponse.success(res, result, 'Job created');
  } catch (err) {
    next(err);
  }
};

export const adminAddRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.id as string;
    const result = await adminService.adminAddRole(jobId, req.body);
    return ApiResponse.success(res, result, 'Role added');
  } catch (err) {
    next(err);
  }
};

export const getJobs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    const statusFilter = req.query.statusFilter as string | undefined;
    const result = await adminService.getJobs(page, limit, search, statusFilter);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getJobPaymentDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.getJobPaymentDetails(id);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getAdminJobById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.getAdminJobById(id);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.adminUpdateJob(id, req.body);
    return ApiResponse.success(res, result, 'Job updated');
  } catch (err) {
    next(err);
  }
};

export const adminUpdateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const roleId = req.params.roleId as string;
    const result = await adminService.adminUpdateRole(jobId, roleId, req.body);
    return ApiResponse.success(res, result, 'Role updated');
  } catch (err) {
    next(err);
  }
};

export const updateJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const status = req.body.status as string;
    if (!['APPROVED', 'PENDING', 'REJECTED'].includes(status)) {
      return ApiResponse.error(res, 'Status must be APPROVED, PENDING, or REJECTED', 400);
    }
    const result = await adminService.updateJobStatus(id, status as 'APPROVED' | 'PENDING' | 'REJECTED');
    return ApiResponse.success(res, result, 'Status updated');
  } catch (err) {
    next(err);
  }
};

export const loginAsRecruiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.loginAsRecruiter(id);
    return ApiResponse.success(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
};

export const loginAsTalent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await adminService.loginAsTalent(id);
    return ApiResponse.success(res, result, 'Login successful');
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

export const getAdminBlogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await adminService.getAdminBlogs(page, limit);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const createBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, image, date, categoryId } = req.body;
    if (!title) return ApiResponse.error(res, 'Title is required', 400);
    const result = await adminService.createBlog({ title, description: description || '', image: image || '', date: date || '', categoryId: categoryId || null });
    return ApiResponse.success(res, result, 'Blog created');
  } catch (err) {
    next(err);
  }
};

export const updateBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blogId = parseInt(req.params.id as string);
    if (isNaN(blogId)) return ApiResponse.error(res, 'Invalid blog ID', 400);
    const { title, description, image, date, categoryId } = req.body;
    if (!title) return ApiResponse.error(res, 'Title is required', 400);
    const result = await adminService.updateBlog(blogId, { title, description: description || '', image: image || undefined, date: date || '', categoryId: categoryId || null });
    return ApiResponse.success(res, result, 'Blog updated');
  } catch (err) {
    next(err);
  }
};

export const deleteBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blogId = parseInt(req.params.id as string);
    if (isNaN(blogId)) return ApiResponse.error(res, 'Invalid blog ID', 400);
    await adminService.deleteBlog(blogId);
    return ApiResponse.success(res, null, 'Blog deleted');
  } catch (err) {
    next(err);
  }
};

export const uploadBlogImageHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return ApiResponse.error(res, 'No file uploaded', 400);
    const result = await adminService.uploadBlogImageService(req.file);
    return ApiResponse.success(res, result, 'Image uploaded', 201);
  } catch (err) {
    next(err);
  }
};

export const getLanguages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await adminService.getLanguages(page, limit);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
};

export const createLanguage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name) return ApiResponse.error(res, 'Name is required', 400);
    const result = await adminService.createLanguage(name);
    return ApiResponse.success(res, result, 'Language created', 201);
  } catch (err) {
    next(err);
  }
};

export const deleteLanguage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await adminService.deleteLanguage(id);
    return ApiResponse.success(res, null, 'Language deleted');
  } catch (err) {
    next(err);
  }
};

export const updateLanguage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    if (!name) return ApiResponse.error(res, 'Name is required', 400);
    const result = await adminService.updateLanguage(id, name);
    return ApiResponse.success(res, result, 'Language updated');
  } catch (err) {
    next(err);
  }
};
