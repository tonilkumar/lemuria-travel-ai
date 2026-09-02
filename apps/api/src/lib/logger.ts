import { pino, type LoggerOptions } from 'pino';
import { env, isProd } from '../config/env.js';

/**
 * Structured logging with hard redaction (spec §51). Anything matching these
 * paths is replaced before it reaches a transport, so a careless
 * `log.info({ user })` cannot leak a password hash or a passport number.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'mfaSecret',
  '*.mfaSecret',
  'apiKey',
  '*.apiKey',
  'AI_API_KEY',
  'passportNumber',
  '*.passportNumber',
  'passportNumberHash',
  'visaNumber',
  '*.visaNumber',
  'DOCUMENT_ENCRYPTION_KEY',
  'S3_SECRET_ACCESS_KEY',
  'SMTP_PASSWORD',
  'WHATSAPP_ACCESS_TOKEN',
];

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'lemuria-api', env: env.NODE_ENV },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = isProd
  ? pino(options)
  : pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
    });

export type Logger = typeof logger;
