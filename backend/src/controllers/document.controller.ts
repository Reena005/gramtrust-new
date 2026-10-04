import { Request, Response } from 'express';
import { documentService } from '@/services/document.service.js';

export const documentController = {
  async getAll(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const documents = await documentService.getAll();

    return res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  },

  async getById(req: Request, res: Response) {
    const document = await documentService.getById(
      String(req.params.id)
    );

    return res.status(200).json({
      success: true,
      data: document,
    });
  },

  async verify(req: Request, res: Response) {
    const result = await documentService.verify(
      String(req.params.id)
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  },

  async anchor(req: Request, res: Response) {
    const document = await documentService.anchor(
      String(req.params.id)
    );

    return res.status(200).json({
      success: true,
      data: document,
    });
  },
};