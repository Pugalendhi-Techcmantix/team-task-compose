import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const HMAC_ALGORITHMS = ['HS256', 'HS384', 'HS512'] as const;
const ASYMMETRIC_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'] as const;
const TOKEN_ALGORITHMS = [...HMAC_ALGORITHMS, ...ASYMMETRIC_ALGORITHMS] as const;

const CONVERSATION_AUTHORIZATION_MODES = ['laravel', 'deny-all', 'allow-all-dev'] as const;
const MESSAGE_PERSISTENCE_MODES = ['laravel', 'realtime-only'] as const;

export type TokenAlgorithm = (typeof TOKEN_ALGORITHMS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Empty strings in .env files mean "not set". */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

const booleanString = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const redisChannel = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'must contain only letters, digits, ".", "_", ":" or "-"');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),

  CORS_ORIGIN: z.string({ required_error: 'is required' }).trim().min(1, 'is required'),

  REDIS_HOST: z.string({ required_error: 'is required' }).trim().min(1, 'is required'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_USERNAME: optionalString,
  REDIS_PASSWORD: optionalString,
  REDIS_TLS: booleanString,
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_RECONNECT_MAX_DELAY_MS: positiveInt(5000),

  REDIS_TASK_CHANNEL: redisChannel.default('task.events'),
  /** Unset → "chat.events"; set to an empty value → chat channel disabled. */
  REDIS_CHAT_CHANNEL: z
    .union([z.literal(''), redisChannel])
    .optional()
    .transform((value) => (value === undefined ? 'chat.events' : value || undefined)),

  REALTIME_TOKEN_ALGORITHM: z.enum(TOKEN_ALGORITHMS).default('HS256'),
  REALTIME_TOKEN_SECRET: optionalString,
  REALTIME_TOKEN_PUBLIC_KEY: optionalString,
  REALTIME_TOKEN_ISSUER: z.string({ required_error: 'is required' }).trim().min(1, 'is required'),
  REALTIME_TOKEN_AUDIENCE: z.string({ required_error: 'is required' }).trim().min(1, 'is required'),
  REALTIME_TOKEN_USER_CLAIM: z.string().trim().min(1).default('sub'),
  REALTIME_TOKEN_CLOCK_TOLERANCE_SEC: z.coerce.number().int().min(0).max(300).default(5),

  /** Defaults to "laravel" when LARAVEL_API_URL is set, otherwise "deny-all". */
  CONVERSATION_AUTHORIZATION_MODE: z
    .union([z.literal(''), z.enum(CONVERSATION_AUTHORIZATION_MODES)])
    .optional(),
  /** Defaults to "laravel" when LARAVEL_API_URL is set, otherwise "realtime-only". */
  MESSAGE_PERSISTENCE_MODE: z.union([z.literal(''), z.enum(MESSAGE_PERSISTENCE_MODES)]).optional(),

  LARAVEL_API_URL: optionalString.pipe(
    z
      .string()
      .url('must be an absolute URL, e.g. http://laravel:8000/api/v1')
      .refine((url) => /^https?:\/\//.test(url), 'must use http or https')
      .transform((url) => url.replace(/\/+$/, ''))
      .optional()
  ),
  LARAVEL_SERVICE_TOKEN: optionalString,
  LARAVEL_API_TIMEOUT_MS: positiveInt(3000),
  LARAVEL_MEMBERSHIP_PATH: z
    .string()
    .trim()
    .default('/internal/conversations/{conversationId}/members/{userId}'),
  LARAVEL_MESSAGES_PATH: z
    .string()
    .trim()
    .default('/internal/conversations/{conversationId}/messages'),

  CHAT_MAX_MESSAGE_LENGTH: positiveInt(2000),
  SOCKET_MAX_PAYLOAD_BYTES: positiveInt(16 * 1024),
  EVENT_DEDUPE_TTL_MS: positiveInt(10 * 60 * 1000),

  RATE_LIMIT_WINDOW_MS: positiveInt(10_000),
  RATE_LIMIT_CHAT_SEND: positiveInt(20),
  RATE_LIMIT_TYPING: positiveInt(30),
  RATE_LIMIT_CONVERSATION_JOIN: positiveInt(30),

  SHUTDOWN_TIMEOUT_MS: positiveInt(10_000),

  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

/**
 * Rules spanning several variables. They read raw values so they run even when some other
 * field is invalid; every problem is reported in one pass.
 */
function crossFieldIssues(raw: NodeJS.ProcessEnv): string[] {
  const issues: string[] = [];
  const value = (name: string): string => (raw[name] ?? '').trim();
  const nodeEnv = value('NODE_ENV') || 'development';
  const algorithm = value('REALTIME_TOKEN_ALGORITHM') || 'HS256';

  const origins = splitOrigins(value('CORS_ORIGIN'));
  if (value('CORS_ORIGIN') && origins.length === 0) {
    issues.push('CORS_ORIGIN must list at least one origin');
  }
  for (const origin of origins) {
    if (origin === '*') {
      if (nodeEnv === 'production') {
        issues.push('CORS_ORIGIN wildcard "*" is not allowed in production');
      }
    } else if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      issues.push(
        `CORS_ORIGIN "${origin}" is not a valid origin (expected scheme://host[:port], no path)`
      );
    }
  }

  if ((HMAC_ALGORITHMS as readonly string[]).includes(algorithm)) {
    if (value('REALTIME_TOKEN_SECRET').length < 32) {
      issues.push(
        `REALTIME_TOKEN_SECRET is required and must be at least 32 characters for ${algorithm}`
      );
    }
  } else if ((ASYMMETRIC_ALGORITHMS as readonly string[]).includes(algorithm)) {
    if (!value('REALTIME_TOKEN_PUBLIC_KEY')) {
      issues.push(`REALTIME_TOKEN_PUBLIC_KEY is required for ${algorithm}`);
    }
  }

  const laravelUrl = value('LARAVEL_API_URL');
  const authorizationMode = resolveAuthorizationMode(
    value('CONVERSATION_AUTHORIZATION_MODE'),
    laravelUrl
  );
  const persistenceMode = resolvePersistenceMode(value('MESSAGE_PERSISTENCE_MODE'), laravelUrl);

  if (nodeEnv === 'production' && authorizationMode === 'allow-all-dev') {
    issues.push('CONVERSATION_AUTHORIZATION_MODE "allow-all-dev" is not allowed in production');
  }

  if (authorizationMode === 'laravel' || persistenceMode === 'laravel') {
    if (!laravelUrl) {
      issues.push(
        'LARAVEL_API_URL is required when conversation authorization or message persistence uses "laravel"'
      );
    }
    if (value('LARAVEL_SERVICE_TOKEN').length < 32) {
      issues.push(
        'LARAVEL_SERVICE_TOKEN is required and must be at least 32 characters when calling Laravel'
      );
    }
  }
  const membershipPath = value('LARAVEL_MEMBERSHIP_PATH');
  if (membershipPath && !/\{conversationId\}/.test(membershipPath)) {
    issues.push('LARAVEL_MEMBERSHIP_PATH must contain {conversationId}');
  }
  if (membershipPath && !/\{userId\}/.test(membershipPath)) {
    issues.push('LARAVEL_MEMBERSHIP_PATH must contain {userId}');
  }
  const messagesPath = value('LARAVEL_MESSAGES_PATH');
  if (messagesPath && !/\{conversationId\}/.test(messagesPath)) {
    issues.push('LARAVEL_MESSAGES_PATH must contain {conversationId}');
  }

  const taskChannel = value('REDIS_TASK_CHANNEL') || 'task.events';
  const chatChannel =
    raw.REDIS_CHAT_CHANNEL === undefined ? 'chat.events' : value('REDIS_CHAT_CHANNEL');
  if (chatChannel && taskChannel === chatChannel) {
    issues.push('REDIS_CHAT_CHANNEL must differ from REDIS_TASK_CHANNEL');
  }
  return issues;
}

export type ConversationAuthorizationMode = (typeof CONVERSATION_AUTHORIZATION_MODES)[number];
export type MessagePersistenceMode = (typeof MESSAGE_PERSISTENCE_MODES)[number];

function resolveAuthorizationMode(
  mode: string | undefined,
  laravelUrl: string | undefined
): ConversationAuthorizationMode {
  if (mode && (CONVERSATION_AUTHORIZATION_MODES as readonly string[]).includes(mode)) {
    return mode as ConversationAuthorizationMode;
  }
  return laravelUrl ? 'laravel' : 'deny-all';
}

function resolvePersistenceMode(
  mode: string | undefined,
  laravelUrl: string | undefined
): MessagePersistenceMode {
  if (mode && (MESSAGE_PERSISTENCE_MODES as readonly string[]).includes(mode)) {
    return mode as MessagePersistenceMode;
  }
  return laravelUrl ? 'laravel' : 'realtime-only';
}

function isHmacAlgorithm(algorithm: TokenAlgorithm): boolean {
  return (HMAC_ALGORITHMS as readonly string[]).includes(algorithm);
}

function splitOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export interface RedisConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
  db: number;
  reconnectMaxDelayMs: number;
  taskChannel: string;
  /** Undefined when the chat channel is disabled. */
  chatChannel?: string;
}

export interface AuthConfig {
  algorithm: TokenAlgorithm;
  /** HMAC secret or PEM public key, depending on `algorithm`. */
  verificationKey: string;
  issuer: string;
  audience: string;
  userIdClaim: string;
  clockToleranceSec: number;
}

export interface LaravelConfig {
  /** Base URL without trailing slash, e.g. http://laravel:8000/api/v1 */
  baseUrl: string;
  /** Bearer token proving to Laravel that a call comes from this service. */
  serviceToken?: string;
  timeoutMs: number;
  /** Path template with {conversationId} and {userId}. */
  membershipPath: string;
  /** Path template with {conversationId}. */
  messagesPath: string;
}

export interface RateLimitConfig {
  windowMs: number;
  chatSend: number;
  typing: number;
  conversationJoin: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigins: string[];
  redis: RedisConfig;
  auth: AuthConfig;
  conversationAuthorizationMode: ConversationAuthorizationMode;
  messagePersistenceMode: MessagePersistenceMode;
  /** Present when LARAVEL_API_URL is set. */
  laravel?: LaravelConfig;
  chat: { maxMessageLength: number };
  socket: { maxPayloadBytes: number };
  events: { dedupeTtlMs: number };
  rateLimits: RateLimitConfig;
  shutdownTimeoutMs: number;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Validates environment variables and maps them to a typed config object.
 * Throws ConfigError listing every problem. Values are never echoed, so secrets stay out of output.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  const issues = [
    ...(result.success
      ? []
      : result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)),
    ...crossFieldIssues(source),
  ];
  if (!result.success || issues.length > 0) {
    throw new ConfigError(issues);
  }
  const env = result.data;

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    corsOrigins: splitOrigins(env.CORS_ORIGIN),
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      username: env.REDIS_USERNAME,
      password: env.REDIS_PASSWORD,
      tls: env.REDIS_TLS,
      db: env.REDIS_DB,
      reconnectMaxDelayMs: env.REDIS_RECONNECT_MAX_DELAY_MS,
      taskChannel: env.REDIS_TASK_CHANNEL,
      chatChannel: env.REDIS_CHAT_CHANNEL,
    },
    auth: {
      algorithm: env.REALTIME_TOKEN_ALGORITHM,
      verificationKey: isHmacAlgorithm(env.REALTIME_TOKEN_ALGORITHM)
        ? (env.REALTIME_TOKEN_SECRET as string)
        : // PEM keys are commonly stored in env vars with escaped newlines.
          (env.REALTIME_TOKEN_PUBLIC_KEY as string).replace(/\\n/g, '\n'),
      issuer: env.REALTIME_TOKEN_ISSUER,
      audience: env.REALTIME_TOKEN_AUDIENCE,
      userIdClaim: env.REALTIME_TOKEN_USER_CLAIM,
      clockToleranceSec: env.REALTIME_TOKEN_CLOCK_TOLERANCE_SEC,
    },
    conversationAuthorizationMode: resolveAuthorizationMode(
      env.CONVERSATION_AUTHORIZATION_MODE,
      env.LARAVEL_API_URL
    ),
    messagePersistenceMode: resolvePersistenceMode(
      env.MESSAGE_PERSISTENCE_MODE,
      env.LARAVEL_API_URL
    ),
    ...(env.LARAVEL_API_URL
      ? {
          laravel: {
            baseUrl: env.LARAVEL_API_URL,
            serviceToken: env.LARAVEL_SERVICE_TOKEN,
            timeoutMs: env.LARAVEL_API_TIMEOUT_MS,
            membershipPath: env.LARAVEL_MEMBERSHIP_PATH,
            messagesPath: env.LARAVEL_MESSAGES_PATH,
          },
        }
      : {}),
    chat: { maxMessageLength: env.CHAT_MAX_MESSAGE_LENGTH },
    socket: { maxPayloadBytes: env.SOCKET_MAX_PAYLOAD_BYTES },
    events: { dedupeTtlMs: env.EVENT_DEDUPE_TTL_MS },
    rateLimits: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      chatSend: env.RATE_LIMIT_CHAT_SEND,
      typing: env.RATE_LIMIT_TYPING,
      conversationJoin: env.RATE_LIMIT_CONVERSATION_JOIN,
    },
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    logLevel: env.LOG_LEVEL,
  };
}
