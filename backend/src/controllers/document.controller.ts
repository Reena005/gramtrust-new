import { Request, Response } from 'express';
import { documentService } from '@/services/document.service.js';

export const documentController = {
  async getAll(_req: Request, res: Response) {
    const documents = await documentService.getAll();

    res.json({
      success: true,
      count: documents.length,
      data: documents,
    });
  },

  async getById(req: Request, res: Response) {
    const document = await documentService.getById(String(req.params.id));

    res.json({
      success: true,
      data: document,
    });
  },

  async verify(req: Request, res: Response) {
    const result = await documentService.verify(String(req.params.id));

    res.json({
      success: true,
      data: result,
    });
  },

  async anchor(req: Request, res: Response) {
    const result = await documentService.anchor(String(req.params.id));
    res.status(201).json({ success: true, data: result });
  },
};