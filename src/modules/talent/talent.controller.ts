import { Request, Response, NextFunction } from 'express';
import * as talentService from './talent.service';
import { ApiResponse } from '../../utils/apiResponse';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as talentSearchService from './talent.search.service';

export const getPublicProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;
    const result = await talentService.getPublicProfile({
      username: typeof username === 'string' ? username : username[0],  
      viewerUserId: req.user?.userId,   // undefined if not logged in
      viewerRole: req.user?.role,       // undefined if not logged in
    });
    ApiResponse.success(res, result, 'Profile fetched successfully');
  } catch (err) { next(err); }
};



export const getFilterOptions = async (req: Request, res: Response) => {
  try {
    const data = await talentSearchService.getTalentFilterOptions();
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load filter options' });
  }
};

export const getCategoryCounts = async (req: Request, res: Response) => {
  try {
    const data = await talentSearchService.getTalentCategoryCounts();
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load category counts' });
  }
};

export const getFeaturedTalents = async (req: Request, res: Response) => {
  try {
    const data = await talentSearchService.getFeaturedTalents();
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to load featured talents' });
  }
};

export const search = async (req: Request, res: Response) => {
  try {
    const result = await talentSearchService.searchTalents(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to search talents' });
  }
};