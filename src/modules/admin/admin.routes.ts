import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';

const router = Router();

router.post('/login', adminController.login);
router.get('/talents', authenticate, authorize('ADMIN'), adminController.getTalents);
router.patch('/talents/:id/status', authenticate, authorize('ADMIN'), adminController.updateTalentStatus);

export default router;
