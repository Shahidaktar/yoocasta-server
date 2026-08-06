import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as profileService from './profile.service';
import { ApiResponse } from '../../utils/apiResponse';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.getMyProfile(req.user!.userId);
    ApiResponse.success(res, result, 'Profile fetched successfully');
  } catch (err) { next(err); }
};

export const getFormOptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.getFormOptions();
    ApiResponse.success(res, result, 'Options fetched successfully');
  } catch (err) { next(err); }
};

export const updateBasicInfo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updateBasicInfo(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const updatePhysicalAttributes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updatePhysicalAttributes(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const updateCategoriesAndSkills = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updateCategoriesAndSkills(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const updateBioAndDescription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updateBioAndDescription(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const uploadProfilePhotoHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return ApiResponse.error(res, 'No file uploaded', 400);
    const result = await profileService.uploadProfilePhotoService(req.user!.userId, req.file);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const checkProfileComplete = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.checkProfileComplete(req.user!.userId);
    ApiResponse.success(res, result, 'Profile check complete');
  } catch (err) { next(err); }
};

export const uploadPortfolioMediaHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return ApiResponse.error(res, 'No file uploaded', 400);
    const { type, title } = req.body;
    if (!type) return ApiResponse.error(res, 'Media type required', 400);
    const result = await profileService.uploadPortfolioMediaService(req.user!.userId, req.file, type, title);
    ApiResponse.success(res, result, 'Media uploaded successfully', 201);
  } catch (err) { next(err); }
};

export const deletePortfolioMediaHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const mediaId = req.params.mediaId as string;
    const result = await profileService.deletePortfolioMediaService(req.user!.userId, mediaId);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

// FIXED: Now calls service instead of Prisma directly
export const getPortfolioMediaHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.getPortfolioMedia(req.user!.userId);
    ApiResponse.success(res, result, 'Portfolio fetched');
  } catch (err) { next(err); }
};



// ─── Career History ─────────────────────────────────────────────
export const addCareerHistoryHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.addCareerHistory(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message, 201);
  } catch (err) { next(err); }
};

export const updateCareerHistoryHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updateCareerHistory(req.user!.userId, req.params.historyId as string, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const deleteCareerHistoryHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.deleteCareerHistory(req.user!.userId, req.params.historyId as string);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

// ─── Courses ───────────────────────────────────────────────────
export const addCourseHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.addCourse(req.user!.userId, req.body);
    ApiResponse.success(res, result, result.message, 201);
  } catch (err) { next(err); }
};

export const updateCourseHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.updateCourse(req.user!.userId, req.params.courseId as string, req.body);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const deleteCourseHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await profileService.deleteCourse(req.user!.userId, req.params.courseId as string);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

// ─── Portfolio Link & Reorder ─────────────────────────────────
export const addPortfolioLinkHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.videoLink) return ApiResponse.error(res, 'Video link is required', 400);
    const result = await profileService.addPortfolioLinkService(req.user!.userId, req.body);
    ApiResponse.success(res, result, 'Link added successfully', 201);
  } catch (err) { next(err); }
};

export const reorderPortfolioHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { mediaIds } = req.body;
    if (!Array.isArray(mediaIds)) return ApiResponse.error(res, 'mediaIds array is required', 400);
    const result = await profileService.reorderPortfolioMedia(req.user!.userId, mediaIds);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};