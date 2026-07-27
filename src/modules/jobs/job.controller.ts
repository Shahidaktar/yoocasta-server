import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as jobService from './job.service';
import { ApiResponse } from '../../utils/apiResponse';
import prisma from '../../config/db';

export const getPublicJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await jobService.getPublicJobs(req.query);
    ApiResponse.success(res, result, 'Jobs fetched');
  } catch (err) { next(err); }
};

export const getPublicJobById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await jobService.getPublicJobById(jobId);
    ApiResponse.success(res, result, 'Job fetched');
  } catch (err) { next(err); }
};

export const getFormOptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await jobService.getFormOptions();
    ApiResponse.success(res, data, 'Options fetched');
  } catch (err) { next(err); }
};

export const getCountries = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phoneCode: true },
    });
    ApiResponse.success(res, countries, 'Countries fetched');
  } catch (err) { next(err); }
};

export const createJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await jobService.createJob(req.user!.userId, req.body);
    ApiResponse.success(res, result, 'Job created successfully', 201);
  } catch (err) { next(err); }
};

export const getMyJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await jobService.getMyJobs(req.user!.userId);
    ApiResponse.success(res, result, 'Jobs fetched');
  } catch (err) { next(err); }
};

export const getJobById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await jobService.getJobById(jobId);
    ApiResponse.success(res, result, 'Job fetched');
  } catch (err) { next(err); }
};

export const updateJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await jobService.updateJob(req.user!.userId, jobId, req.body);
    ApiResponse.success(res, result, 'Job updated');
  } catch (err) { next(err); }
};

export const deleteJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await jobService.deleteJob(req.user!.userId, jobId);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};

export const addRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const result = await jobService.addRole(req.user!.userId, jobId, req.body);
    ApiResponse.success(res, result, 'Role added', 201);
  } catch (err) { next(err); }
};

export const updateRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const roleId = req.params.roleId as string;
    const result = await jobService.updateRole(req.user!.userId, jobId, roleId, req.body);
    ApiResponse.success(res, result, 'Role updated');
  } catch (err) { next(err); }
};

export const deleteRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId as string;
    const roleId = req.params.roleId as string;
    const result = await jobService.deleteRole(req.user!.userId, jobId, roleId);
    ApiResponse.success(res, result, result.message);
  } catch (err) { next(err); }
};