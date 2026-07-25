import { Router } from 'express';
import * as adminController from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';

const router = Router();

router.post('/login', adminController.login);
router.get('/talents', authenticate, authorize('ADMIN'), adminController.getTalents);
router.get('/companies', authenticate, authorize('ADMIN'), adminController.getCompanies);
router.get('/companies/active', authenticate, authorize('ADMIN'), adminController.getActiveCompanies);
router.post('/jobs', authenticate, authorize('ADMIN'), adminController.adminCreateJob);
router.post('/jobs/:id/roles', authenticate, authorize('ADMIN'), adminController.adminAddRole);
router.patch('/companies/:id/verify', authenticate, authorize('ADMIN'), adminController.updateCompanyVerify);
router.patch('/companies/:id/status', authenticate, authorize('ADMIN'), adminController.updateCompanyStatus);
router.post('/companies/:id/login', authenticate, authorize('ADMIN'), adminController.loginAsRecruiter);
router.get('/jobs', authenticate, authorize('ADMIN'), adminController.getJobs);
router.get('/jobs/:id/payment', authenticate, authorize('ADMIN'), adminController.getJobPaymentDetails);
router.get('/jobs/:id', authenticate, authorize('ADMIN'), adminController.getAdminJobById);
router.put('/jobs/:id', authenticate, authorize('ADMIN'), adminController.adminUpdateJob);
router.put('/jobs/:jobId/roles/:roleId', authenticate, authorize('ADMIN'), adminController.adminUpdateRole);
router.patch('/jobs/:id/status', authenticate, authorize('ADMIN'), adminController.updateJobStatus);
router.patch('/talents/:id/status', authenticate, authorize('ADMIN'), adminController.updateTalentStatus);
router.get('/talents/:id/subscription', authenticate, authorize('ADMIN'), adminController.getTalentSubscriptionDetails);
router.post('/talents/:id/login', authenticate, authorize('ADMIN'), adminController.loginAsTalent);

export default router;
