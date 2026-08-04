import { Router } from 'express';
import { getPageContent } from './cms.controller';

const router = Router();

router.get('/:key', getPageContent);

export default router;
