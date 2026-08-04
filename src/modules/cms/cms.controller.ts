import { Request, Response, NextFunction } from 'express';
import { getPublicCmsPage } from './cms.service';
import { ApiResponse } from '../../utils/apiResponse';

export const getPageContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await getPublicCmsPage(req.params.key as string);
    if (!page) {
      return ApiResponse.error(res, 'Page not found', 404);
    }
    return ApiResponse.success(res, page, 'Page content fetched');
  } catch (err) {
    next(err);
  }
};
