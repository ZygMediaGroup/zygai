import { createHash, randomUUID } from 'crypto';
import { run, get, all } from './db.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - match JWT expiration
const RATE_LIMIT_TTL_MS = 15 * 60 * 1000; // 15 minutes

const hashToken = (token) => {
  return createHash('sha256')
    .update(token)
    .digest('hex');
};

const hashRateLimitKey = (key) => {
  return createHash('sha256')
    .update(key)
    .digest('hex');
};

const createSession = async (userId, token, userAgent = null, ipAddress = null) => {
  const sessionId = randomUUID();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await run(`
    INSERT INTO sessions
    (id, user_id, token_hash, user_agent, ip_address, last_active_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    sessionId,
    userId,
    tokenHash,
    userAgent,
    ipAddress,
    now,
    expiresAt,
    now
  ]);

  return { id: sessionId, userId, expiresAt };
};

const validateSession = async (token) => {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const session = await get(`
    SELECT id, user_id, expires_at, revoked_at
    FROM sessions
    WHERE token_hash = ?
  `, [tokenHash]);

  if (!session) return null;
  if (session.revoked_at) return null;

  // Check expiration
  if (new Date(session.expires_at) <= new Date()) {
    return null;
  }

  // Update last active time
  await run(`
    UPDATE sessions
    SET last_active_at = ?
    WHERE id = ?
  `, [now, session.id]);

  return {
    id: session.id,
    userId: session.user_id
  };
};

const revokeSession = async (sessionId) => {
  const now = new Date().toISOString();
  return run(`
    UPDATE sessions
    SET revoked_at = ?
    WHERE id = ?
  `, [now, sessionId]);
};

const revokeSessionByToken = async (token) => {
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  return run(`
    UPDATE sessions
    SET revoked_at = ?
    WHERE token_hash = ?
  `, [now, tokenHash]);
};

const revokeAllUserSessions = async (userId, exceptSessionId = null) => {
  const now = new Date().toISOString();

  if (exceptSessionId) {
    return run(`
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ? AND id != ? AND revoked_at IS NULL
    `, [now, userId, exceptSessionId]);
  } else {
    return run(`
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `, [now, userId]);
  }
};

const getUserSessions = async (userId) => {
  return all(`
    SELECT id, user_agent, ip_address, last_active_at, created_at, expires_at
    FROM sessions
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY last_active_at DESC
  `, [userId]);
};

const cleanupExpiredSessions = async () => {
  const now = new Date().toISOString();

  await run(`
    DELETE FROM sessions
    WHERE expires_at < ? OR revoked_at IS NOT NULL
  `, [now]);

  await run(`
    DELETE FROM rate_limits
    WHERE reset_at < ?
  `, [now]);
};

// Rate limit persistence
const getRateLimit = async (key) => {
  const keyHash = hashRateLimitKey(key);
  const now = new Date().toISOString();

  const entry = await get(`
    SELECT count, reset_at
    FROM rate_limits
    WHERE key_hash = ?
  `, [keyHash]);

  if (!entry) return null;

  if (new Date(entry.reset_at) <= new Date()) {
    await run('DELETE FROM rate_limits WHERE key_hash = ?', [keyHash]);
    return null;
  }

  return {
    count: entry.count,
    resetAt: entry.reset_at
  };
};

const incrementRateLimit = async (key, ttlMs = RATE_LIMIT_TTL_MS) => {
  const keyHash = hashRateLimitKey(key);
  const now = new Date().toISOString();
  const resetAt = new Date(Date.now() + ttlMs).toISOString();

  const existing = await getRateLimit(key);

  if (existing) {
    await run(`
      UPDATE rate_limits
      SET count = count + 1, updated_at = ?
      WHERE key_hash = ?
    `, [now, keyHash]);

    return {
      count: existing.count + 1,
      resetAt: existing.resetAt
    };
  } else {
    await run(`
      INSERT INTO rate_limits
      (key_hash, count, reset_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE
        count = count + 1,
        updated_at = ?
    `, [keyHash, resetAt, now, now]);

    return {
      count: 1,
      resetAt
    };
  }
};

export {
  createSession,
  validateSession,
  revokeSession,
  revokeSessionByToken,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  getRateLimit,
  incrementRateLimit
};
