import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from '@/config/env';
import { authService } from '@/services/auth.service';
import { apiRoutes } from '@/routes';
import { notFoundMiddleware } from '@/middlewares/not-found.middleware';
import { errorMiddleware } from '@/middlewares/error.middleware';
import { projectRepository } from '@/repositories/project.repository';
import { blockchainRepository } from '@/repositories/blockchain.repository';
import { auditRepository } from '@/repositories/audit.repository';
import { tamperLogService } from '@/services/tamper-log.service';

let sseClients: express.Response[] = [];

// Periodic background check to detect DB tampering and persist to DB
setInterval(async () => {
  try {
    const projects = await projectRepository.findAll();
    const activeTampered: any[] = [];

    for (const project of projects) {
      const latestRecord =
        await blockchainRepository.findLatestByProjectId(project.id);

      const blockchainAmount = latestRecord
        ? Number(latestRecord.amount)
        : 0;

      const dbAmount = Number(project.amount);

      if (dbAmount !== blockchainAmount) {
        activeTampered.push({
          code: project.code,
          name: project.name,
          dbAmount,
          blockchainAmount,
        });

        // If DB doesn't have it marked as Mismatch yet, persist the violation
        if (project.integrityStatus !== 'Mismatch') {
          await projectRepository.updateBlockchainFields(project.code, {
            integrityStatus: 'Mismatch',
          });

          await auditRepository.create({
            projectId: project.id,
            databaseAmount: dbAmount,
            blockchainAmount,
            difference: dbAmount - blockchainAmount,
            status: 'Mismatch',
            notes: {
              action: 'AUTO_MONITOR_TAMPER',
              timestamp: new Date().toLocaleTimeString(),
            },
          });

          await tamperLogService.logDirectDbChange(
            project.code,
            'amount',
            dbAmount,
            blockchainAmount,
          );
        }
      } else {
        // If it was marked as Mismatch but now matches (restored), update status
        if (project.integrityStatus === 'Mismatch') {
          await projectRepository.updateBlockchainFields(project.code, {
            integrityStatus: 'Verified',
          });

          await auditRepository.create({
            projectId: project.id,
            databaseAmount: dbAmount,
            blockchainAmount,
            difference: 0,
            status: 'Verified',
            notes: {
              action: 'AUTO_MONITOR_RESTORE',
              timestamp: new Date().toLocaleTimeString(),
            },
          });
        }
      }
    }

    // Fetch the recent audits to build history dynamically
    const recentAudits = await auditRepository.findRecent(30);

    const historyList = recentAudits
      .filter(
        (audit) =>
          audit.status === 'Mismatch' ||
          (audit.notes &&
            (audit.notes.action === 'AUTO_MONITOR_TAMPER' ||
              audit.notes.action === 'AUTO_MONITOR_RESTORE')),
      )
      .map((audit) => {
        const proj = projects.find((p) => p.id === audit.projectId);

        return {
          code: proj ? proj.code : 'UNKNOWN',
          name: proj ? proj.name : 'Unknown Project',
          dbAmount: audit.databaseAmount,
          blockchainAmount: audit.blockchainAmount,
          timestamp: audit.createdAt.toLocaleTimeString(),
          status:
            audit.status === 'Mismatch'
              ? ('ACTIVE' as const)
              : ('RESTORED' as const),
        };
      });

    const data = JSON.stringify({
      tampered: activeTampered,
      history: historyList,
    });

    sseClients.forEach((client) => {
      client.write(`data: ${data}\n\n`);
    });
  } catch (err) {
    console.error('Integrity background check error:', err);
  }
}, 3000);

export function createApp() {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: [env.CORS_ORIGIN, 'http://localhost:5174'],
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'),
  );

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'gramtrust-backend',
    });
  });

  // SSE Stream Endpoint
  app.get('/api/integrity-stream', (req, res) => {
    const authorizationHeader = req.headers.authorization;
    const bearerToken =
      authorizationHeader?.startsWith('Bearer ')
        ? authorizationHeader.slice(7)
        : undefined;
    const queryToken =
      typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = bearerToken ?? queryToken;

    if (!token) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    try {
      const user = authService.verifyToken(token);
      if (
        !user.sub ||
        !['CITIZEN', 'OFFICIAL', 'ADMIN', 'AUDITOR'].includes(user.role)
      ) {
        res.status(403).json({ message: 'Access denied.' });
        return;
      }
    } catch {
      res.status(401).json({ message: 'Invalid or expired token.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);

    // Send initial status immediately from DB
    Promise.all([
      projectRepository.findAll(),
      auditRepository.findRecent(30),
    ])
      .then(([projects, recentAudits]) => {
        const activeTampered = projects
          .filter((p) => p.integrityStatus === 'Mismatch')
          .map((p) => ({
            code: p.code,
            name: p.name,
            dbAmount: Number(p.amount),
            blockchainAmount: Number(p.amount),
          }));

        const historyList = recentAudits
          .filter(
            (audit) =>
              audit.status === 'Mismatch' ||
              (audit.notes &&
                (audit.notes.action === 'AUTO_MONITOR_TAMPER' ||
                  audit.notes.action === 'AUTO_MONITOR_RESTORE')),
          )
          .map((audit) => {
            const proj = projects.find((p) => p.id === audit.projectId);

            return {
              code: proj ? proj.code : 'UNKNOWN',
              name: proj ? proj.name : 'Unknown Project',
              dbAmount: audit.databaseAmount,
              blockchainAmount: audit.blockchainAmount,
              timestamp: audit.createdAt.toLocaleTimeString(),
              status:
                audit.status === 'Mismatch'
                  ? ('ACTIVE' as const)
                  : ('RESTORED' as const),
            };
          });

        res.write(
          `data: ${JSON.stringify({
            tampered: activeTampered,
            history: historyList,
          })}\n\n`,
        );
      })
      .catch(() => {});

    req.on('close', () => {
      sseClients = sseClients.filter((client) => client !== res);
    });
  });

  // Serve Document Integrity PDFs
  app.use(
    '/documents/files',
    express.static(path.resolve(process.cwd(), 'documents')),
  );

  // Existing API routes
  app.use('/api', apiRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}