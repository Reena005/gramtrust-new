# GramTrust

GramTrust is a blockchain-based Panchayat transparency platform focused on the immutable fund ledger.

## Repository Layout

- `frontend/` contains the Vite React app
- `backend/` Express + Prisma + PostgreSQL API
- `blockchain/` chaincode and gateway scaffolding
- `database/` SQL and Prisma schema assets
- `datasets/` seed CSV files
- `docs/` architecture and API notes

## Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run build
npm run dev
```

Set `DATABASE_URL` in `backend/.env` before running migrations or seeding.

To load the uploaded `NREGA.csv` dataset, place it in `datasets/` for local seeding or upload it to `POST /api/import` as multipart form-data with a `file` field.

## AI Work Verification Results Table

To add the AI work-verification results table to the existing GramTrust PostgreSQL database, set `DATABASE_URL` in your PowerShell session and run this from the repository root:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database\ai_work_verification.sql
```

The existing `database/schema.sql` enables the `pgcrypto` extension used by `gen_random_uuid()`. If PostgreSQL reports that `gen_random_uuid()` does not exist, enable `pgcrypto` on the existing database (subject to the database user's permissions) and rerun the SQL file; do not replace the UUID default with a different design.

## Root Docker Compose

```bash
docker compose up --build
```

The compose file starts PostgreSQL and the backend service.
