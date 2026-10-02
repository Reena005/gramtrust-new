import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CSV_STORAGE_PATH: z.string().default('../datasets/NREGA.csv'),
  JWT_SECRET: z.string().min(16).default('gramtrust_super_secret_jwt_key_2024_immutable_ledger'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  FABRIC_ENABLED: z.preprocess(
    (value) => value === 'true',
    z.boolean()
  ).default(false),

  FABRIC_CHANNEL: z.string().default('gramtrust-channel'),
  FABRIC_CHAINCODE: z.string().default('gramtrust'),
  FABRIC_MSP_ID: z.string().default('Org1MSP'),
  FABRIC_PEER_ENDPOINT: z.string().default('localhost:7051'),
  FABRIC_PEER_HOST_ALIAS: z.string().default('peer0.org1.example.com'),

  FABRIC_TLS_CERT_PATH: z.string().optional(),
  FABRIC_CERT_PATH: z.string().optional(),
  FABRIC_KEY_PATH: z.string().optional(),
});

export const env = envSchema.parse(process.env);