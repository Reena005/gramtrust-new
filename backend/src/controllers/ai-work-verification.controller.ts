import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler.js';
import { aiWorkVerificationService } from '@/services/ai-work-verification.service.js';
import { AppError } from '@/utils/app-error.js';

const uploadDirectory = fileURLToPath(
  new URL('../../ai/work-verification/uploads/', import.meta.url),
);
const citizenUploadDirectory = fileURLToPath(
  new URL('../../ai/work-verification/citizen-uploads/', import.meta.url),
);

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

export const aiWorkVerificationController = {
  analyze: asyncHandler(async (req: Request, res: Response) => {
    const projectId =
      typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const projectDescription =
      typeof req.body?.projectDescription === 'string'
        ? req.body.projectDescription.trim()
        : '';
    const image = req.file;

    if (!projectId) {
      throw new AppError('projectId is required.', 400);
    }
    if (!projectDescription) {
      throw new AppError('projectDescription is required.', 400);
    }
    if (!image) {
      throw new AppError('An image file is required in the image field.', 400);
    }

    const extension = extensionByMimeType[image.mimetype];
    if (!extension) {
      throw new AppError('The uploaded file must be a supported image.', 400);
    }

    const filename = `${randomUUID()}${extension}`;
    const savedImagePath = path.join(uploadDirectory, filename);
    const imagePath = `ai/work-verification/uploads/${filename}`;

    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(savedImagePath, image.buffer, { flag: 'wx' });

    let result: Awaited<
      ReturnType<typeof aiWorkVerificationService.analyzeAndSave>
    >;
    try {
      result = await aiWorkVerificationService.analyzeAndSave({
        projectId,
        projectDescription,
        imagePath,
        image: {
          buffer: image.buffer,
          originalname: image.originalname,
          mimetype: image.mimetype,
        },
      });
    } catch (error) {
      try {
        await unlink(savedImagePath);
      } catch (cleanupError) {
        if (
          !(cleanupError instanceof Error) ||
          !('code' in cleanupError) ||
          cleanupError.code !== 'ENOENT'
        ) {
          console.error(
            `Failed to clean up AI work-verification image ${imagePath}:`,
            cleanupError,
          );
        }
      }
      throw error;
    }

    res.status(201).json({
      message: 'AI work verification completed',
      data: result,
    });
  }),

  verifyCitizenPhoto: asyncHandler(async (req: Request, res: Response) => {
    const projectId =
      typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const image = req.file;

    if (!projectId) {
      throw new AppError('projectId is required.', 400);
    }
    if (!image) {
      throw new AppError('A citizen image file is required in the image field.', 400);
    }

    const extension = extensionByMimeType[image.mimetype];
    if (!extension) {
      throw new AppError('The uploaded file must be a supported image.', 400);
    }
    if (!req.user?.sub) {
      throw new AppError('Authentication required.', 401);
    }

    const filename = `${randomUUID()}${extension}`;
    const savedImagePath = path.join(citizenUploadDirectory, filename);
    const imagePath = `ai/work-verification/citizen-uploads/${filename}`;
    await mkdir(citizenUploadDirectory, { recursive: true });
    await writeFile(savedImagePath, image.buffer, { flag: 'wx' });

    try {
      const result = await aiWorkVerificationService.verifyCitizenPhoto({
        projectId,
        citizenUserId: req.user.sub,
        citizenImagePath: imagePath,
        citizenImage: {
          buffer: image.buffer,
          originalname: image.originalname,
          mimetype: image.mimetype,
        },
      });
      if (result.result === 'NO_REFERENCE_PHOTO') {
        try {
          await unlink(savedImagePath);
        } catch (cleanupError) {
          if (
            !(cleanupError instanceof Error) ||
            !('code' in cleanupError) ||
            cleanupError.code !== 'ENOENT'
          ) {
            console.error(
              `Failed to clean up citizen photo ${imagePath}:`,
              cleanupError,
            );
          }
        }
        res.status(200).json({
          message: result.message,
          data: result,
        });
        return;
      }

      res.status(201).json({
        message: 'Citizen photo verification completed',
        data: result,
      });
    } catch (error) {
      try {
        await unlink(savedImagePath);
      } catch (cleanupError) {
        if (
          !(cleanupError instanceof Error) ||
          !('code' in cleanupError) ||
          cleanupError.code !== 'ENOENT'
        ) {
          console.error(
            `Failed to clean up citizen photo ${imagePath}:`,
            cleanupError,
          );
        }
      }
      throw error;
    }
  }),
};
