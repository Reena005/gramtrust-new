import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { aiWorkVerificationController } from '@/controllers/ai-work-verification.controller.js';
import { requireRole } from '@/middlewares/auth.middleware.js';
import { AppError } from '@/utils/app-error.js';

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!extensionByMimeType[file.mimetype]) {
      callback(new AppError('The uploaded file must be a supported image.', 400));
      return;
    }
    callback(null, true);
  },
});

const uploadImage = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  upload.single('image')(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Image must be 10 MB or smaller.', 413));
        return;
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError('Upload exactly one file in the image field.', 400));
        return;
      }
      next(new AppError(`Invalid image upload: ${error.message}`, 400));
      return;
    }
    next(error);
  });
};

export const aiWorkVerificationRoutes = Router();

aiWorkVerificationRoutes.post(
  '/analyze',
  requireRole('OFFICIAL', 'ADMIN'),
  uploadImage,
  aiWorkVerificationController.analyze,
);

aiWorkVerificationRoutes.post(
  '/citizen-photo-verification',
  requireRole('CITIZEN'),
  uploadImage,
  aiWorkVerificationController.verifyCitizenPhoto,
);
