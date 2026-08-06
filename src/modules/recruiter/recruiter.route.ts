import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { uploadCompanyLogo, uploadTradeLicense } from '../../middleware/upload.middleware';
import * as recruiterController from './recruiter.controller';
import * as castBagController from './castBag.controller';
import * as zcardController from './zcard.controller';

const router = Router();

// Z Card — public
router.post('/z-card', zcardController.generatePdf);

// All routes below require RECRUITER role
router.use(authenticate, authorize('RECRUITER'));

router.get('/profile', recruiterController.getProfile);
router.put('/profile', recruiterController.updateProfile);
router.put('/profile/location', recruiterController.updateLocation); // ADD THIS
router.post('/profile/logo', uploadCompanyLogo, recruiterController.uploadLogo);
router.post('/profile/license', uploadTradeLicense, recruiterController.uploadTradeLicense);

// Cast Bag routes
router.post('/cast-bags', castBagController.create);
router.get('/cast-bags', castBagController.list);
router.delete('/cast-bags/:bagId', castBagController.remove);
router.post('/cast-bags/:bagId/talents', castBagController.addTalents);
router.post('/cast-bags/:bagId/share', castBagController.share);
router.get('/cast-bags/:bagId/feedbacks', castBagController.getFeedbacks);

export default router;