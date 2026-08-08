import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as castBagService from './castBag.service';
import { ApiResponse } from '../../utils/apiResponse';

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return ApiResponse.error(res, 'Name is required', 400);
    const result = await castBagService.createCastBag(req.user!.userId, name.trim());
    ApiResponse.success(res, result, 'Cast bag created');
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await castBagService.getMyCastBags(req.user!.userId);
    ApiResponse.success(res, result, 'Cast bags fetched');
  } catch (err) { next(err); }
};

export const remove = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bagId = req.params.bagId as string;
    const result = await castBagService.deleteCastBag(req.user!.userId, bagId);
    ApiResponse.success(res, result, 'Cast bag deleted');
  } catch (err) { next(err); }
};

export const addTalents = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bagId = req.params.bagId as string;
    const { talentUserIds } = req.body;
    if (!talentUserIds?.length) return ApiResponse.error(res, 'talentUserIds is required', 400);
    const result = await castBagService.addTalentsToBag(req.user!.userId, bagId, talentUserIds);
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
};

export const share = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bagId = req.params.bagId as string;
    const { emails, validityDays } = req.body;
    if (!emails?.length) return ApiResponse.error(res, 'emails is required', 400);
    const result = await castBagService.shareCastBag(req.user!.userId, bagId, emails, validityDays || 7);
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
};

export const getPublic = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const result = await castBagService.getPublicCastBag(token);
    ApiResponse.success(res, result);
  } catch (err) { next(err); }
};

export const feedbackLogin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const { email, password, talentUserId } = req.body;
    if (!email?.trim() || !password) return ApiResponse.error(res, 'Email and password are required', 400);
    const result = await castBagService.validateFeedbackGuest(token, email.trim(), password, talentUserId);
    ApiResponse.success(res, result, 'Feedback login successful');
  } catch (err) { next(err); }
};

export const submitFeedback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const { guestToken, talentUserId, rating, comment, decision } = req.body;
    if (!guestToken || !talentUserId) return ApiResponse.error(res, 'guestToken and talentUserId are required', 400);
    const result = await castBagService.submitCastBagFeedback(token, { guestToken, talentUserId, rating, comment, decision });
    ApiResponse.success(res, result, 'Feedback submitted');
  } catch (err) { next(err); }
};

export const feedbackStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const { guestToken, talentUserId } = req.body;
    if (!guestToken || !talentUserId) return ApiResponse.error(res, 'guestToken and talentUserId are required', 400);
    const result = await castBagService.castBagFeedbackStatus(token, guestToken, talentUserId);
    ApiResponse.success(res, result, 'Feedback status fetched');
  } catch (err) { next(err); }
};

export const getFeedbacks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bagId = req.params.bagId as string;
    const result = await castBagService.getCastBagFeedbacks(req.user!.userId, bagId);
    ApiResponse.success(res, result, 'Feedbacks fetched');
  } catch (err) { next(err); }
};
