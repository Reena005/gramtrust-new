import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { pool } from '@/config/db.js';
import { env } from '@/config/env.js';
import { AppError } from '@/utils/app-error.js';

const similarityScoreSchema = z.number().min(-1).max(1);
const citizenPhotoAnalysisResponseSchema = z.object({
  similarity_score: similarityScoreSchema,
  model_name: z.string().min(1).max(100),
  result: z.enum([
    'VERIFIED',
    'REVIEW_REQUIRED',
    'INSUFFICIENT_EVIDENCE',
  ]),
  reason: z.string(),
  metadata: z.object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    capture_timestamp: z.string().nullable(),
  }),
  details: z.record(z.string(), z.unknown()),
});

const referenceUploadsDirectory = fileURLToPath(
  new URL('../../ai/work-verification/uploads/', import.meta.url),
);
const referenceImagePathPrefix = 'ai/work-verification/uploads/';
const extensionToMimeType: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

const aiAnalysisResponseSchema = z.object({
  model: z.string().min(1).max(100),
  similarity_scores: z.record(z.string(), similarityScoreSchema),
  predicted_stage: z.enum([
    'Not started',
    'Early stage',
    'Partially completed',
    'Mostly completed',
    'Fully completed',
  ]),
  similarity_score: similarityScoreSchema,
  result: z.enum([
    'VERIFIED',
    'REVIEW_REQUIRED',
    'INSUFFICIENT_EVIDENCE',
  ]),
  reason: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export interface AnalyzeAndSaveWorkVerificationInput {
  projectId: string;
  projectDescription: string;
  imagePath: string;
  image: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
}

export interface VerifyCitizenPhotoInput {
  projectId: string;
  citizenUserId: string;
  citizenImagePath: string;
  citizenImage: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  };
}

interface ReferenceImage {
  imagePath: string;
  absolutePath: string;
  mimetype: string;
  filename: string;
}

async function findLatestReferenceImage(
  projectId: string,
): Promise<ReferenceImage | undefined> {
  const { rows } = await pool.query<{ image_path: string }>(
    `SELECT image_path
     FROM ai_work_verification_results
     WHERE project_id = $1
     ORDER BY created_at DESC NULLS LAST, id DESC`,
    [projectId],
  );
  if (rows.length === 0) {
    return undefined;
  }

  let realUploadsDirectory: string;
  try {
    realUploadsDirectory = await realpath(referenceUploadsDirectory);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  for (const row of rows) {
    const imagePath = row.image_path;
    if (!imagePath.startsWith(referenceImagePathPrefix)) {
      continue;
    }
    const filename = imagePath.slice(referenceImagePathPrefix.length);
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const mimetype = extensionToMimeType[extension];
    if (!filename || basename(filename) !== filename || !mimetype) {
      continue;
    }

    try {
      const candidatePath = resolve(realUploadsDirectory, filename);
      const actualPath = await realpath(candidatePath);
      const relativePath = relative(realUploadsDirectory, actualPath);
      if (
        !relativePath ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        continue;
      }
      const fileStats = await stat(actualPath);
      if (!fileStats.isFile()) {
        continue;
      }
      return { imagePath, absolutePath: actualPath, mimetype, filename };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  return undefined;
}

export const aiWorkVerificationService = {
  async verifyCitizenPhoto(input: VerifyCitizenPhotoInput) {
    const projectId = input.projectId.trim();
    if (
      !projectId ||
      !input.citizenUserId.trim() ||
      !input.citizenImagePath.trim()
    ) {
      throw new AppError(
        'Project ID, authenticated citizen ID, and citizen image path are required.',
        400,
      );
    }
    if (input.citizenImage.buffer.length === 0) {
      throw new AppError('The uploaded image is empty.', 400);
    }
    if (
      !Object.values(extensionToMimeType).includes(input.citizenImage.mimetype)
    ) {
      throw new AppError('The uploaded file must be a supported image.', 400);
    }

    const referenceImage = await findLatestReferenceImage(projectId);
    if (!referenceImage) {
      return {
        result: 'NO_REFERENCE_PHOTO' as const,
        message: 'No photo is referenced for this project.',
      };
    }

    const referenceBuffer = await readFile(referenceImage.absolutePath);
    const form = new FormData();
    form.set(
      'reference_image',
      new Blob([new Uint8Array(referenceBuffer)], {
        type: referenceImage.mimetype,
      }),
      referenceImage.filename,
    );
    form.set(
      'citizen_image',
      new Blob([new Uint8Array(input.citizenImage.buffer)], {
        type: input.citizenImage.mimetype,
      }),
      basename(input.citizenImage.originalname) || 'citizen-image',
    );

    let response: Response;
    try {
      response = await fetch(
        `${env.AI_SERVICE_URL.replace(/\/+$/, '')}/compare-images`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new AppError('The Python AI service request timed out.', 504);
      }
      if (error instanceof TypeError) {
        throw new AppError(
          `The Python AI service is unavailable at ${env.AI_SERVICE_URL}.`,
          503,
        );
      }
      throw error;
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new AppError('The Python AI service request timed out.', 504);
      }
      throw new AppError('Could not read the Python AI service response.', 502);
    }
    if (!response.ok) {
      throw new AppError(
        `The Python AI service returned HTTP ${response.status}.`,
        502,
        responseText.slice(0, 1000),
      );
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new AppError('The Python AI service returned invalid JSON.', 502);
    }

    const validation =
      citizenPhotoAnalysisResponseSchema.safeParse(parsedResponse);
    if (!validation.success) {
      throw new AppError(
        'The Python AI service returned an invalid comparison response.',
        502,
        validation.error.flatten(),
      );
    }
    const analysis = validation.data;

    const { rows: savedRows } = await pool.query(
      `INSERT INTO ai_citizen_photo_verification
        (project_id, citizen_user_id, reference_image_path, citizen_image_path,
         model_name, similarity_score, result, reason, citizen_latitude,
         citizen_longitude, capture_timestamp, gps_distance_meters, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamp, NULL, $12::jsonb)
       RETURNING id, project_id, citizen_user_id, reference_image_path,
                 citizen_image_path, model_name, similarity_score, result,
                 reason, citizen_latitude, citizen_longitude,
                 capture_timestamp, gps_distance_meters, details, created_at`,
      [
        projectId,
        input.citizenUserId,
        referenceImage.imagePath,
        input.citizenImagePath,
        analysis.model_name,
        analysis.similarity_score,
        analysis.result,
        analysis.reason,
        analysis.metadata.latitude,
        analysis.metadata.longitude,
        analysis.metadata.capture_timestamp,
        JSON.stringify(analysis.details),
      ],
    );

    return {
      ...savedRows[0],
      ...analysis,
    };
  },

  async analyzeAndSave(input: AnalyzeAndSaveWorkVerificationInput) {
    const projectId = input.projectId.trim();
    const projectDescription = input.projectDescription.trim();
    if (!projectId || !projectDescription || !input.imagePath.trim()) {
      throw new AppError(
        'Project ID, project description, and image path are required.',
        400,
      );
    }
    if (input.image.buffer.length === 0) {
      throw new AppError('The uploaded image is empty.', 400);
    }
    if (!input.image.mimetype.startsWith('image/')) {
      throw new AppError('The uploaded file must be an image.', 400);
    }

    const form = new FormData();
    form.set('image', new Blob([new Uint8Array(input.image.buffer)], {
      type: input.image.mimetype,
    }), basename(input.image.originalname) || 'evidence-image');
    form.set('project_description', projectDescription);

    let response: Response;
    try {
      response = await fetch(
        `${env.AI_SERVICE_URL.replace(/\/+$/, '')}/analyze`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new AppError('The Python AI service request timed out.', 504);
      }
      if (error instanceof TypeError) {
        throw new AppError(
          `The Python AI service is unavailable at ${env.AI_SERVICE_URL}.`,
          503,
        );
      }
      throw error;
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new AppError('The Python AI service request timed out.', 504);
      }
      throw new AppError('Could not read the Python AI service response.', 502);
    }
    if (!response.ok) {
      throw new AppError(
        `The Python AI service returned HTTP ${response.status}.`,
        502,
        responseText.slice(0, 1000),
      );
    }

    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new AppError('The Python AI service returned invalid JSON.', 502);
    }

    const validation = aiAnalysisResponseSchema.safeParse(parsedResponse);
    if (!validation.success) {
      throw new AppError(
        'The Python AI service returned an invalid analysis response.',
        502,
        validation.error.flatten(),
      );
    }
    const analysis = validation.data;

    const { rows } = await pool.query(
      `INSERT INTO ai_work_verification_results
        (project_id, image_path, model_name, reported_completion,
         predicted_stage, similarity_score, result, reason, details)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, project_id, image_path, model_name, reported_completion,
                 predicted_stage, similarity_score, result, reason, details,
                 created_at`,
      [
        projectId,
        input.imagePath.trim(),
        analysis.model,
        analysis.predicted_stage,
        analysis.similarity_score,
        analysis.result,
        analysis.reason,
        JSON.stringify({
          ...analysis.details,
          similarity_scores: analysis.similarity_scores,
        }),
      ],
    );

    return rows[0];
  },
};
