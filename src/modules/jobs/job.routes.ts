import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import {
  createJob,
  getMyJobs,
  getJobById,
  updateJob,
  deleteJob,
  addRole,
  updateRole,
  deleteRole,
  getFormOptions,
  getPublicJobById,
  getPublicJobs,
  getCountries,
} from './job.controller';

const router = Router();

// Public routes (no auth required)
router.get('/public', getPublicJobs);
router.get('/public/:jobId', getPublicJobById);
router.get('/options', getFormOptions);
router.get('/countries', getCountries);

router.use(authenticate);

// Job CRUD — Recruiter only
router.post('/', authorize('RECRUITER'), createJob);
router.get('/my-jobs', authorize('RECRUITER'), getMyJobs);
router.get('/:jobId', getJobById);
router.put('/:jobId', authorize('RECRUITER'), updateJob);
router.delete('/:jobId', authorize('RECRUITER'), deleteJob);

// Role CRUD
router.post('/:jobId/roles', authorize('RECRUITER'), addRole);
router.put('/:jobId/roles/:roleId', authorize('RECRUITER'), updateRole);
router.delete('/:jobId/roles/:roleId', authorize('RECRUITER'), deleteRole);

export default router;