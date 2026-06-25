import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// pdf-parse CommonJS import for ESM compatibility
globalThis.pdfParse = require('pdf-parse');
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac
} from 'crypto';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { WebSocketServer } from 'ws';
import { initDb, run, get, all } from './db.js';
import { hashPassword, signToken, verifyPassword, verifyToken, isAdminEmail } from './auth.js';
import { encryptMessage, decryptMessage } from './encryption.js';
import {
  createSession,
  validateSession,
  revokeSessionByToken,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  getRateLimit,
  incrementRateLimit
} from './sessions.js';
import { sendEmail, sendVerificationEmail, sendPasswordResetEmail } from './email.js';
import { callExa, callExaImages } from './exa.js';
import { setupReachRoutes } from './reach.js';
import { resolveModelConfig } from './model-resolver.js';
import Stripe from 'stripe';
import { getProviderHandler, getStreamProviderHandler, getImageProviderHandler } from './providers/index.js';
import multer from 'multer';

await initDb();

const ensureFeatureModelOptionsTable = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS feature_model_options (
      feature_key VARCHAR(100) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model_id VARCHAR(255) NOT NULL,
      label VARCHAR(255) DEFAULT NULL,
      position INT NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (feature_key, provider, model_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

await ensureFeatureModelOptionsTable();

// Load vision models list
let visionModels = [];
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const visionModelsPath = path.join(__dirname, 'vision-models.json');
  const data = fs.readFileSync(visionModelsPath, 'utf8');
  visionModels = JSON.parse(data);
} catch (error) {
  console.error('Failed to load vision-models.json:', error);
  visionModels = [];
}

const app = express();
app.set('trust proxy', 1); // Trust the reverse proxy to securely parse IPs

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token.' });
  try {
    const decoded = verifyToken(token);
    const userRow = await get(
        'SELECT id, email, display_name, plan, role, email_verified, ai_role_id, two_factor_enabled, api_credits, grace_plan, grace_plan_expires_at FROM users WHERE id = ?',
        [decoded.id]
    );
    if (!userRow) return res.status(401).json({ error: 'User not found.' });
    if (!userRow.email_verified) {
      return res.status(403).json({ error: 'Email not verified.' });
    }

    // Check if session is valid and not revoked
    const session = await validateSession(token);
    
    // Backwards compatibility: if no session exists for this token, create it
    // This ensures existing users with valid tokens don't get logged out
    if (!session) {
      await createSession(
        decoded.id,
        token,
        req.headers['user-agent'] || null,
        req.ip || req.headers['x-forwarded-for'] || 'unknown'
      );
    }

    // Grace period: if admin granted a temporary plan, override the user's plan
    let effectivePlan = userRow.plan;
    let gracePlanActive = false;
    if (userRow.grace_plan) {
      const expiresAt = userRow.grace_plan_expires_at;
      const isForever = !expiresAt;
      const isValid = isForever || new Date(expiresAt) > new Date();
      if (isValid) {
        effectivePlan = userRow.grace_plan;
        gracePlanActive = true;
      } else {
        // Expired — clean up silently
        run('UPDATE users SET grace_plan = NULL, grace_plan_expires_at = NULL WHERE id = ?', [userRow.id]).catch(() => {});
      }
    }

    const role = isAdminEmail(userRow.email) ? 'admin' : userRow.role || 'user';
    req.user = {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name || null,
      plan: effectivePlan,
      basePlan: userRow.plan,
      gracePlanActive,
      gracePlan: userRow.grace_plan || null,
      gracePlanExpiresAt: userRow.grace_plan_expires_at || null,
      role,
      emailVerified: Boolean(userRow.email_verified),
      aiRoleId: userRow.ai_role_id || null,
      twoFactorEnabled: Boolean(userRow.two_factor_enabled),
      apiCredits: userRow.api_credits
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '') || req.query.token;
  if (!token || typeof token !== 'string') {
    return next();
  }
  try {
    const decoded = verifyToken(token);
    const userRow = await get(
        'SELECT id, email, display_name, plan, role, email_verified, ai_role_id, api_credits FROM users WHERE id = ?',
        [decoded.id]
    );
    if (!userRow) return res.status(401).json({ error: 'User not found.' });
    
    // Check if session is valid and not revoked
    const session = await validateSession(token);
    
    // Backwards compatibility: if no session exists for this token, create it
    if (!session) {
      await createSession(
        decoded.id,
        token,
        req.headers['user-agent'] || null,
        req.ip || req.headers['x-forwarded-for'] || 'unknown'
      );
    }

    const role = isAdminEmail(userRow.email) ? 'admin' : userRow.role || 'user';
    req.user = {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name || null,
      plan: userRow.plan,
      role,
      emailVerified: Boolean(userRow.email_verified),
      aiRoleId: userRow.ai_role_id || null,
      apiCredits: userRow.api_credits
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
};

const apiKeyAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const apiKey = authHeader.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ error: { message: 'Missing API key. Use Authorization: Bearer <YOUR_API_KEY>', type: 'invalid_request_error', code: null } });
  }

  try {
    const keyRow = await get(
      'SELECT ak.id as key_id, ak.user_id, ak.ip_allowlist, ak.monthly_limit, ak.current_monthly_spend, ak.last_spend_reset, u.email, u.plan, u.role, u.api_credits FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.api_key = ?',
      [apiKey]
    );

    if (!keyRow) {
      return res.status(401).json({ error: { message: 'Invalid API key.', type: 'invalid_request_error', code: 'invalid_api_key' } });
    }

    // Monthly Spend Reset
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
    let currentSpend = parseFloat(keyRow.current_monthly_spend);
    
    if (keyRow.last_spend_reset !== currentMonth) {
      await run('UPDATE api_keys SET current_monthly_spend = 0, last_spend_reset = ? WHERE id = ?', [currentMonth, keyRow.key_id]);
      currentSpend = 0;
    }

    // IP Allowlist Check
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (keyRow.ip_allowlist) {
      const allowedIps = keyRow.ip_allowlist.split(',').map(ip => ip.trim());
      if (!allowedIps.includes(clientIp)) {
        return res.status(403).json({ error: { message: `IP address ${clientIp} is not authorized for this API key.`, type: 'invalid_request_error', code: 'ip_not_allowed' } });
      }
    }

    // Monthly Limit Check
    if (keyRow.monthly_limit !== null && currentSpend >= parseFloat(keyRow.monthly_limit)) {
      return res.status(403).json({ error: { message: 'API key has reached its monthly spend limit.', type: 'insufficient_quota', code: 'monthly_limit_reached' } });
    }

    if (parseFloat(keyRow.api_credits) <= 0) {
      return res.status(403).json({ error: { message: 'Insufficient API credits. Please top up your balance.', type: 'insufficient_quota', code: 'insufficient_quota' } });
    }

    req.user = {
      id: keyRow.user_id,
      email: keyRow.email,
      plan: keyRow.plan,
      role: keyRow.role,
      apiCredits: parseFloat(keyRow.api_credits)
    };
    req.apiKey = apiKey;
    req.apiKeyId = keyRow.key_id;

    // Update last used at asynchronously
    run('UPDATE api_keys SET last_used_at = ? WHERE api_key = ?', [new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), apiKey]).catch(e => console.error('Failed to update API key last_used_at:', e));

    return next();
  } catch (error) {
    console.error('API Key Auth Error:', error);
    return res.status(500).json({ error: { message: 'Internal server error.', type: 'server_error', code: null } });
  }
};
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

const checkRateLimit = async (key) => {
  const entry = await getRateLimit(key);
  if (!entry) return null;
  
  if (entry.count >= MAX_AUTH_ATTEMPTS) {
    return new Date(entry.resetAt) - Date.now();
  }
  return null;
};

const registerAuthAttempt = async (key) => {
  return incrementRateLimit(key, AUTH_WINDOW_MS);
};

const authRateLimit = async (req, res, next) => {
  const ip = req.ip || 'unknown'; // Rely on trust proxy instead of unverified headers
  const email = (req.body?.email || '').toLowerCase();
  const ipKey = `ip:${ip}`;
  const emailKey = email ? `email:${email}` : null;
  const ipRemaining = await checkRateLimit(ipKey);
  const emailRemaining = emailKey ? await checkRateLimit(emailKey) : null;
  const retryAfterMs = Math.max(ipRemaining || 0, emailRemaining || 0);

  if (retryAfterMs > 0) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const ipEntry = await registerAuthAttempt(ipKey);
  const emailEntry = emailKey ? await registerAuthAttempt(emailKey) : null;
  if (ipEntry.count > MAX_AUTH_ATTEMPTS || (emailEntry && emailEntry.count > MAX_AUTH_ATTEMPTS)) {
    res.setHeader('Retry-After', Math.ceil(AUTH_WINDOW_MS / 1000));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  return next();
};

// Run cleanup on startup
await cleanupExpiredSessions();

// Schedule periodic cleanup every hour
setInterval(async () => {
  try {
    await cleanupExpiredSessions();
  } catch (error) {
    console.error('Session cleanup failed:', error);
  }
}, 60 * 60 * 1000);
app.use(cors());

// Set a comprehensive Content Security Policy to address various loading issues.
// Temporary image storage
const TEMP_IMAGE_TTL = 30 * 60 * 1000; // 30 minutes
const tempImages = new Map();

// Cleanup expired images every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, image] of tempImages) {
    if (now - image.createdAt > TEMP_IMAGE_TTL) {
      tempImages.delete(id);
    }
  }
}, 5 * 60 * 1000);

const resolveImageToBase64 = (imgData, userId) => {
  if (!imgData) return null;
  
  // Handle cognivision references
  if (imgData.startsWith('cognivision://')) {
    const id = imgData.replace('cognivision://', '');
    const temp = tempImages.get(id);
    if (temp && temp.userId === userId) {
      const match = temp.data.match(/^data:image\/[^;]+;base64,(.*)$/);
      return match ? match[1] : temp.data;
    }
    return null;
  }
  
  // Handle permanent uploads
  if (imgData.startsWith('/uploads/')) {
    try {
      const filePath = path.join(__dirname, '..', 'public', imgData);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath).toString('base64');
      }
    } catch (e) {
      console.error('[Vision] Failed to read uploaded image:', e);
    }
    return null;
  }
  
  // Handle data URLs
  if (imgData.startsWith('data:image/')) {
    const match = imgData.match(/^data:image\/[^;]+;base64,(.*)$/);
    return match ? match[1] : null;
  }
  
  // Assume it's already a raw base64 string
  return imgData;
};

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/v1')) return next();
  
  const connectSrc = [
    "'self'",
    'https:',
    'http:',
    'http://100.76.3.3:8085',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://100.76.3.3:*',
    'http://100.98.94.107:11434',
    'http://100.67.226.75:11434',
    'wss:',
    'https://*.googlesyndication.com'
  ];
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.gstatic.com https://*.googlesyndication.com https://*.doubleclick.net https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; media-src 'self' https: data: blob:; connect-src ${connectSrc.join(' ')} blob:; frame-src 'self' https:; worker-src 'self' blob:;`);
  next();
});

// Restrict API domain to only serve API routes
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const host = req.headers.host?.split(':')[0];
  let apiHostname = '';
  try {
    apiHostname = new URL(API_BASE_URL).hostname;
  } catch (e) {
    apiHostname = 'apisservice.zygai.app';
  }

  if (host === apiHostname && !req.path.startsWith('/api') && !req.path.startsWith('/v1') && !req.path.startsWith('/uploads') && req.path !== '/health') {
    return res.status(403).send('Forbidden: API domain only handles API requests.');
  }
  next();
});
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;



const onlineUsers = new Map();
const ONLINE_TTL_MS = 2 * 60 * 1000;

const updateOnlineUser = (userId) => {
  onlineUsers.set(userId, Date.now());
};

const getOnlineCount = () => {
  const now = Date.now();
  for (const [userId, lastSeen] of onlineUsers.entries()) {
    if (now - lastSeen > ONLINE_TTL_MS) {
      onlineUsers.delete(userId);
    }
  }
  return onlineUsers.size;
};

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send('Stripe not configured.');
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing Stripe signature.');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log(`[Stripe Webhook] Received event: ${event.type}`);
  } catch (err) {
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session?.metadata?.userId;
    const plan = session?.metadata?.plan;
    const type = session?.metadata?.type;
    const amount = session?.metadata?.amount;

    if (type === 'topup' && userId && amount) {
      try {
        const depositAmount = parseFloat(amount);
        await run(
          'UPDATE users SET api_credits = api_credits + ? WHERE id = ?',
          [depositAmount, userId]
        );
        console.log(`[Stripe Webhook] API credits topped up for user ${userId} by $${depositAmount}`);
      } catch (dbErr) {
        console.error(`[Stripe Webhook] Credit update failed for user ${userId}:`, dbErr);
      }
    } else if (userId && ['go', 'plus'].includes(plan)) {
      try {
        const result = await run(
            'UPDATE users SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?',
            [plan, session.customer, session.subscription, userId]
        );
        console.log(`[Stripe Webhook] Plan updated for user ${userId} to ${plan}. Affected rows: ${result.affectedRows}`);
      } catch (dbErr) {
        console.error(`[Stripe Webhook] Database update failed for user ${userId}:`, dbErr);
      }
    } else {
      console.warn(`[Stripe Webhook] Session completed but missing valid metadata. userId: ${userId}, plan: ${plan}, type: ${type}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    console.log(`[Stripe Webhook] Subscription deleted: ${subscription.id}`);
    await run("UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_subscription_id = ?", [subscription.id]);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '12mb' })); // raised for document uploads (PDF base64 ~4x raw size)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Multer for image uploads
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed.'));
    }
  }
});

app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});

app.use('/uploads', express.static(uploadsDir));
const musicDir = path.join(__dirname, '..', 'public', 'music');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
app.use('/music', express.static(musicDir));

// --- Public V1 API (OpenAI Compatible) ---
const v1Router = express.Router();

v1Router.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-JSON', 'X-Stream-Data'],
  credentials: false,
  maxAge: 86400
}));

v1Router.get('/', (req, res) => {
  res.json({ 
    message: 'ZygAI API is active.', 
    version: '1.0.0',
    documentation: 'https://zygai.app/docs' // or appropriate link
  });
});

v1Router.get('/models', apiKeyAuthMiddleware, async (req, res) => {
  try {
    const models = await all(
      `SELECT mc.id, mc.model_id, mc.name, mc.description, mc.supports_vision, mc.category, ap.name as provider_name 
       FROM model_configs mc 
       JOIN api_providers ap ON mc.provider_id = ap.id 
       WHERE mc.enabled = 1 AND ap.enabled = 1 
       AND (ap.provider_type LIKE 'zygai%' OR ap.provider_type IS NULL)`
    );

    res.json({
      object: 'list',
      data: models.map(m => {
        // Extract context window from category (e.g., "8k", "32k", "128k")
        let contextWindow = 4096; // Default safe fallback
        if (m.category && m.category.toLowerCase().endsWith('k')) {
          const num = parseInt(m.category);
          if (!isNaN(num)) contextWindow = num * 1024;
        }

        return {
          id: m.id,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: m.provider_name || 'zygai',
          permission: [],
          root: m.id,
          parent: null,
          context_window: contextWindow
        };
      })
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error', code: null } });
  }
});

// Alias for chat completions to handle various SDK paths
const chatHandler = async (req, res) => {
  const { model, messages, stream, temperature, max_tokens, top_p, prompt, tools, tool_choice } = req.body;
  
  // Handle legacy 'prompt' style by converting to message if messages is missing
  let processedMessages = messages;
  if (!processedMessages && prompt) {
    processedMessages = [{ role: 'user', content: prompt }];
  }

  if (!processedMessages || !Array.isArray(processedMessages)) {
    return res.status(400).json({ error: { message: 'messages is required and must be an array.', type: 'invalid_request_error', code: null } });
  }

  try {
    const config = await resolveModelConfig(model || 'zygrouter');
    if (!config) {
      return res.status(404).json({ error: { message: `Model '${model || 'default'}' not found or disabled.`, type: 'invalid_request_error', code: 'model_not_found' } });
    }

    // Enforce ZygAI infrastructure only
    if (!config.provider.type?.startsWith('zygai') && config.provider.type !== null) {
      return res.status(403).json({ error: { message: `The model '${model}' is not available via the public API. Only ZygAI infrastructure models are allowed.`, type: 'invalid_request_error', code: 'forbidden_provider' } });
    }

    const providerType = config.provider.type || 'zygai';
    const providerHandler = stream ? getStreamProviderHandler(providerType) : getProviderHandler(providerType);
    
    if (!providerHandler) {
      return res.status(400).json({ error: { message: `Unsupported provider or model: ${model}`, type: 'invalid_request_error', code: null } });
    }

    // Simple token estimation: words * 1.3
    const countTokens = (text) => {
      if (!text || typeof text !== 'string') return 0;
      // Remove thinking content for billing
      const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return Math.ceil(cleanText.split(/\s+/).filter(Boolean).length * 1.3);
    };
    
    const inputTokens = processedMessages.reduce((acc, msg) => {
      let textContent = '';
      if (typeof msg.content === 'string') {
        textContent = msg.content;
      } else if (Array.isArray(msg.content)) {
        textContent = msg.content
          .map((part) => (typeof part === 'string' ? part : part.text || ''))
          .join(' ');
      }
      return acc + countTokens(textContent);
    }, 0);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const generator = providerHandler({
        providerRow: { ...config.provider, base_url: config.provider.baseUrl, api_key: config.provider.apiKey },
        modelId: config.modelId,
        messages: processedMessages,
        temperature: temperature ?? 0.7,
        maxTokens: max_tokens,
        topP: top_p,
        tools,
        toolChoice: tool_choice
      });

      let fullContent = '';
      const completionId = `chatcmpl-${createId()}`;
      const created = Math.floor(Date.now() / 1000);

      try {
        for await (const chunk of generator) {
          let delta = {};
          let reasoning = null;
          let finish_reason = null;

          if (chunk.choices?.[0]?.delta) {
            delta = chunk.choices[0].delta;
            reasoning = delta.reasoning_content || delta.reasoning;
            finish_reason = chunk.choices[0].finish_reason;
          } else if (typeof chunk === 'string') {
            delta = { content: chunk };
          } else if (chunk.content) {
            delta = { content: chunk.content };
            reasoning = chunk.reasoning_content || chunk.reasoning;
            finish_reason = chunk.finish_reason;
          }

          if (delta.content) {
            fullContent += delta.content;
          }

          const openAIChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: model || config.modelId,
            choices: [
              {
                index: 0,
                delta: {
                  ...delta,
                  ...(reasoning ? { reasoning_content: reasoning } : {})
                },
                finish_reason: finish_reason || null
              }
            ]
          };
          
          res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
        }

        const outputTokens = countTokens(fullContent);
        
        // Billing
        const settings = await get('SELECT api_input_rate_per_1m, api_output_rate_per_1m FROM site_settings WHERE id = 1');
        const inputRatePer1M = settings ? parseFloat(settings.api_input_rate_per_1m) : 0.0100;
        const outputRatePer1M = settings ? parseFloat(settings.api_output_rate_per_1m) : 0.0700;
        
        const cost = (inputTokens * (inputRatePer1M / 1000000)) + (outputTokens * (outputRatePer1M / 1000000));
        
        await run('UPDATE users SET api_credits = api_credits - ? WHERE id = ?', [cost, req.user.id]);
        if (req.apiKeyId) {
          await run('UPDATE api_keys SET current_monthly_spend = current_monthly_spend + ? WHERE id = ?', [cost, req.apiKeyId]);
          await run(
            'INSERT INTO api_usage_logs (user_id, api_key_id, model_id, prompt_tokens, completion_tokens, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, req.apiKeyId, model || config.modelId, inputTokens, outputTokens, cost, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
          );
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        console.error('Streaming error in V1 API:', err);
        res.write(`data: ${JSON.stringify({ error: { message: err.message, type: 'server_error' } })}\n\n`);
        res.end();
      }
    } else {
      const result = await providerHandler({
        providerRow: { ...config.provider, base_url: config.provider.baseUrl, api_key: config.provider.apiKey },
        modelId: config.modelId,
        messages: processedMessages,
        temperature: temperature ?? 0.7,
        maxTokens: max_tokens,
        topP: top_p,
        tools,
        toolChoice: tool_choice
      });

      const content = (typeof result === 'object' && result !== null) ? (result.content || '') : (result || '');
      const tool_calls = (typeof result === 'object' && result !== null) ? (result.tool_calls || null) : null;
      const outputTokens = countTokens(content);

      const response = {
        id: `chatcmpl-${createId()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || config.modelId,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: content,
              ...(tool_calls && { tool_calls })
            },
            finish_reason: tool_calls ? 'tool_calls' : 'stop'
          }
        ],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        }
      };

      // Billing
      const settings = await get('SELECT api_input_rate_per_1m, api_output_rate_per_1m FROM site_settings WHERE id = 1');
      const inputRatePer1M = settings ? parseFloat(settings.api_input_rate_per_1m) : 0.0100;
      const outputRatePer1M = settings ? parseFloat(settings.api_output_rate_per_1m) : 0.0700;
      
      const cost = (inputTokens * (inputRatePer1M / 1000000)) + (outputTokens * (outputRatePer1M / 1000000));
      
      await run('UPDATE users SET api_credits = api_credits - ? WHERE id = ?', [cost, req.user.id]);
      if (req.apiKeyId) {
        await run('UPDATE api_keys SET current_monthly_spend = current_monthly_spend + ? WHERE id = ?', [cost, req.apiKeyId]);
        await run(
          'INSERT INTO api_usage_logs (user_id, api_key_id, model_id, prompt_tokens, completion_tokens, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.user.id, req.apiKeyId, model || config.modelId, inputTokens, outputTokens, cost, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
        );
      }

      res.json(response);
    }
  } catch (error) {
    console.error('V1 API Error:', error);
    let message = error.message;
    let code = 'server_error';
    
    if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      message = `The model provider for '${model}' is currently unreachable. Please try a different model or contact support.`;
      code = 'provider_unreachable';
    }

    res.status(500).json({ error: { message, type: 'server_error', code } });
  }
};

v1Router.post('/chat/completions', apiKeyAuthMiddleware, chatHandler);
v1Router.post('/completions', apiKeyAuthMiddleware, chatHandler); // Legacy support


// Music config: returns quota usage for the current user
app.get('/api/music/config', authMiddleware, async (req, res) => {
  try {
    const plan = req.user?.plan || 'free';
    const limitMap = { free: 2, go: 20, plus: 50, beta: 50, paid: 50, ad: 2 };
    const limit = limitMap[plan] ?? 2;
    const usageData = await getRateLimit(`plan-quota:music_generation:${req.user.id}`);
    const used = usageData?.count || 0;
    return res.json({ plan, used, limit, remaining: Math.max(0, limit - used) });
  } catch (err) {
    console.error('[music/config] error:', err);
    return res.status(500).json({ error: 'Failed to fetch music config.' });
  }
});

// Music history route
app.get('/api/music/history', authMiddleware, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, prompt, audio_url AS audioUrl, created_at AS createdAt
       FROM music_generations
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    return res.json({ tracks: rows.map(r => ({ ...r, status: 'ready' })) });
  } catch (err) {
    console.error('[music/history] error:', err);
    return res.status(500).json({ error: 'Failed to fetch music history.' });
  }
});

// Music generation route: uses OpenRouter (via model config) and returns an audio URL if available
// Music generation route
app.post('/api/music/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    // ── Quota enforcement ─────────────────────────────────────────────────────
    const quotaRes = await enforcePlanQuota(req.user, 'music_generation');
    if (!quotaRes.ok) {
      return res.status(429).json({
        error: `Daily music generation limit reached (${quotaRes.used}/${quotaRes.limit}). Upgrade your plan for more generations.`,
        quotaExceeded: true,
        used: quotaRes.used,
        limit: quotaRes.limit,
        plan: req.user?.plan || 'free'
      });
    }

    // ── Call OpenRouter Lyria 3 Pro directly ──────────────────────────────────
    const openRouterKey = process.env.OPENROUTER_API_KEY || '';
    if (!openRouterKey) {
      return res.status(500).json({ error: 'OpenRouter API key not configured.' });
    }

    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.APP_BASE_URL || 'https://zygai.app',
        'X-Title': 'ZygAI Music',
      },
      body: JSON.stringify({
        model: 'google/lyria-3-pro-preview',
        modalities: ['audio'],
        audio: { format: 'mp3' },
        stream: true,
        messages: [{ role: 'user', content: prompt.trim() }],
      }),
    });

    if (!orRes.ok) {
      const errText = await orRes.text();
      let errMsg = 'Music generation failed.';
      try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch {}
      console.error('[music/generate] OpenRouter error:', errText.slice(0, 300));
      return res.status(502).json({ error: errMsg });
    }

    // Stream response — collect all chunks, find the audio data chunk
    const rawBody = await orRes.text();
    console.log('[music/generate] OpenRouter status:', orRes.status, 'body preview:', rawBody.slice(0, 300));

    let audioBase64 = null;
    let mimeType = 'audio/mpeg';

    // SSE stream: each line is "data: {...}" or "data: [DONE]"
    const lines = rawBody.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(jsonStr);
        // Audio data can be in delta.audio or message.audio
        const delta = chunk?.choices?.[0]?.delta;
        const msg = chunk?.choices?.[0]?.message;
        const audioObj = delta?.audio || msg?.audio;
        if (audioObj?.data) {
          audioBase64 = (audioBase64 || '') + audioObj.data;
          mimeType = audioObj.mime_type || 'audio/mpeg';
        }
      } catch {}
    }

    if (!audioBase64) {
      console.error('[music/generate] No audio found in stream:', rawBody.slice(0, 800));
      return res.status(502).json({ error: 'No audio returned from model.' });
    }

    // Save base64 audio to public/music/
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'mp3';
    const fileName = `music-${Date.now()}.${ext}`;
    const musicDir = path.join(__dirname, '..', 'public', 'music');
    if (!require('fs').existsSync(musicDir)) require('fs').mkdirSync(musicDir, { recursive: true });
    await fs.promises.writeFile(path.join(musicDir, fileName), Buffer.from(audioBase64, 'base64'));
    const audioUrl = `/music/${fileName}`;

    // Save to DB
    try {
      const genId = require('crypto').randomUUID();
      await run(
        'INSERT INTO music_generations (id, user_id, prompt, audio_url, created_at) VALUES (?, ?, ?, ?, ?)',
        [genId, req.user.id, prompt.trim(), audioUrl, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
      );
    } catch (dbErr) {
      console.error('[music/generate] DB save error:', dbErr);
    }

    return res.json({ output: audioUrl });
  } catch (error) {
    console.error('[music/generate] error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate music.' });
  }
});


// ═══════════════════════════════════════════════════════
//  Model Limits — per-model per-plan daily usage limits
// ═══════════════════════════════════════════════════════

// Helper: check if user has exceeded model limit
async function checkModelLimit(userId, userPlan, modelId, feature = 'chat') {
  let limitColumn;
  if (feature === 'vibe_coder') {
    limitColumn = 'vibe_coder_limit';
  } else {
    // For chat and other features, use per-plan limits
    limitColumn = null;
  }
  
  let limit = null;
  if (limitColumn) {
    // Single limit column (e.g., vibe_coder_limit)
    const limitRow = await get(
      `SELECT ${limitColumn} as limit FROM model_limits WHERE model_id = ? AND enabled = 1`,
      [modelId]
    );
    limit = limitRow?.limit;
  } else {
    // Per-plan limits
    const limitRow = await get(
      'SELECT free_limit, go_limit, plus_limit, beta_limit FROM model_limits WHERE model_id = ? AND enabled = 1',
      [modelId]
    );
    if (!limitRow) return { allowed: true, used: 0, limit: null };
    const planKey = `${userPlan}_limit`;
    limit = limitRow[planKey];
  }
  
  if (limit === null || limit === undefined) return { allowed: true, used: 0, limit: null }; // unlimited

  const today = new Date().toISOString().slice(0, 10);
  const row = await get(
    `SELECT COUNT(*) as cnt FROM usage_logs
     WHERE user_id = ? AND model = ? AND feature = ? AND DATE(created_at) = ?`,
    [userId, modelId, feature, today]
  );
  const used = row?.cnt || 0;
  return { allowed: used < limit, used, limit };
}

// GET /api/model-limits — public, returns all limits
app.get('/api/model-limits', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM model_limits WHERE enabled = 1', []);
    res.json({ limits: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/model-limits/usage — authed, returns today's usage per model for current user
app.get('/api/model-limits/usage', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await all(
      `SELECT model, COUNT(*) as used FROM usage_logs
       WHERE user_id = ? AND DATE(created_at) = ?
       GROUP BY model`,
      [req.user.id, today]
    );
    res.json({ usage: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: GET all model limits
app.get('/api/admin/model-limits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM model_limits ORDER BY model_id', []);
    res.json({ limits: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: PUT update model limit
app.put('/api/admin/model-limits/:modelId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { modelId } = req.params;
    const { free_limit, go_limit, plus_limit, beta_limit, vibe_coder_limit, enabled } = req.body;

    const existing = await get('SELECT model_id FROM model_limits WHERE model_id = ?', [modelId]);
    if (existing) {
      await run(
        `UPDATE model_limits SET free_limit = ?, go_limit = ?, plus_limit = ?, beta_limit = ?, vibe_coder_limit = ?, enabled = ? WHERE model_id = ?`,
        [
          free_limit ?? null,
          go_limit ?? null,
          plus_limit ?? null,
          beta_limit ?? null,
          vibe_coder_limit ?? null,
          enabled !== false ? 1 : 0,
          modelId
        ]
      );
    } else {
      await run(
        `INSERT INTO model_limits (model_id, free_limit, go_limit, plus_limit, beta_limit, vibe_coder_limit, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [modelId, free_limit ?? null, go_limit ?? null, plus_limit ?? null, beta_limit ?? null, vibe_coder_limit ?? null, enabled !== false ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: DELETE model limit
app.delete('/api/admin/model-limits/:modelId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM model_limits WHERE model_id = ?', [req.params.modelId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

v1Router.use((req, res) => {
  res.status(404).json({ 
    error: { 
      message: `Invalid API endpoint: ${req.method} ${req.originalUrl}`, 
      type: 'invalid_request_error', 
      code: 'endpoint_not_found' 
    } 
  });
});

app.use('/api/v1', v1Router);

const APP_BASE_URL = process.env.APP_BASE_URL || 'https://zygai.app';
const EXA_API_KEY = process.env.EXA_API_KEY || '';
const API_BASE_URL = process.env.API_BASE_URL || 'https://apisservice.zygai.app';
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const MODEL_INFO_VERSION =
  process.env.MODEL_INFO_VERSION || process.env.npm_package_version || '3.8';

// Cloudflare Workers AI - Markdown Conversion
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CLOUDFLARE_TOMARKDOWN_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/tomarkdown`;
console.log(`[Cloudflare] Account ID configured: ${!!CLOUDFLARE_ACCOUNT_ID}`);
console.log(`[Cloudflare] API Token configured: ${!!CLOUDFLARE_API_TOKEN}`);

const DEFAULT_PLAN_SETTINGS = [
  { id: 'free', enabled: true },
  { id: 'go', enabled: true },
  { id: 'plus', enabled: true },
  { id: 'beta', enabled: true }
];

const DEFAULT_FEATURE_MODELS = [
  { featureKey: 'calm_mode', provider: 'openrouter', modelId: 'meta-llama/llama-3-8b-instruct', model_id: 'meta-llama/llama-3-8b-instruct' },
  { featureKey: 'image_generation', provider: 'openrouter', modelId: 'm-1772224123622', model_id: 'm-1772224123622' },
  { featureKey: 'reach', provider: 'openrouter', modelId: 'meta-llama/llama-3-8b-instruct', model_id: 'meta-llama/llama-3-8b-instruct' },
  { featureKey: 'games', provider: 'openrouter', modelId: 'meta-llama/llama-3-8b-instruct', model_id: 'meta-llama/llama-3-8b-instruct' },
  {
    featureKey: 'vibe_coder',
    provider: 'zygai-ollama',
    modelId: 'gemma4:e4b',
    model_id: 'gemma4:e4b',
    modelIds: ['gemma4:e4b'],
    modelOptions: [{ provider: 'zygai-ollama', modelId: 'gemma4:e4b', label: 'Gemma 4 (ZygAI Native)' }]
  }
];

const PLAN_LABELS = {
  free: 'ZygAI Free',
  go: 'ZygAI Go',
  plus: 'ZygAI Plus',
  beta: 'ZygAI Beta'
};

const PLAN_QUOTAS = {
  chat: {
    label: 'chat messages',
    windowMs: 2 * 60 * 60 * 1000,
    limits: {
      free: 100,
      go: 500,
      plus: 5000,
      beta: 5000,
      paid: 5000,
      ad: 100
    }
  },
  image_generation: {
    label: 'image generations',
    windowMs: 8 * 60 * 60 * 1000,
    limits: {
      free: 5,
      go: 20,
      plus: 50,
      beta: 50,
      paid: 50,
      ad: 5
    }
  },
  vibe_coder: {
    label: 'Vibe Coder messages',
    windowMs: 24 * 60 * 60 * 1000,
    limits: {
      free: 50,
      go: 150,
      plus: 350,
      beta: 350,
      paid: 350,
      ad: 50
    }
  },
  music_generation: {
    label: 'music generations',
    windowMs: 24 * 60 * 60 * 1000,
    limits: {
      free: 2,
      go: 20,
      plus: 50,
      beta: 50,
      paid: 50,
      ad: 2
    }
  },
  game_rps: { label: 'Rock Paper Scissors plays', windowMs: 12 * 60 * 60 * 1000, limits: { free: 10, go: 50, plus: 200, beta: 200, paid: 200, ad: 10 } },
  game_word_guess: { label: 'Word Guess plays', windowMs: 12 * 60 * 60 * 1000, limits: { free: 10, go: 50, plus: 200, beta: 200, paid: 200, ad: 10 } },
  game_math_duel: { label: 'Math Duel plays', windowMs: 12 * 60 * 60 * 1000, limits: { free: 10, go: 50, plus: 200, beta: 200, paid: 200, ad: 10 } },
  game_i_spy: { label: 'I Spy plays', windowMs: 12 * 60 * 60 * 1000, limits: { free: 10, go: 50, plus: 200, beta: 200, paid: 200, ad: 10 } },
  game_misc: {
    label: 'game reactions',
    windowMs: 12 * 60 * 60 * 1000,
    limits: {
      free: 100,
      go: 500,
      plus: 2000,
      beta: 2000,
      paid: 2000,
      ad: 100
    }
  }
};

const getPlanQuota = (featureKey, plan = 'free') => {
  const quota = PLAN_QUOTAS[featureKey];
  if (!quota) return null;
  const normalizedPlan = quota.limits[plan] !== undefined ? plan : 'free';
  return {
    ...quota,
    plan: normalizedPlan,
    limit: quota.limits[normalizedPlan]
  };
};

const enforcePlanQuota = async (user, featureKey) => {
  if (!user?.id) return { ok: true };
  if (user.role === 'admin') return { ok: true };

  // Check if user has an active campaign for this feature
  const userCampaign = await get(
    `SELECT uc.quota_limit, uc.quota_used FROM user_campaigns uc
     JOIN campaigns c ON uc.campaign_id = c.id
     WHERE uc.user_id = ? AND c.feature_key = ? AND uc.is_active = 1 AND uc.expires_at > ? LIMIT 1`,
    [user.id, featureKey, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
  );

  if (userCampaign) {
    // User has an active campaign, check campaign quota instead of plan quota
    if (userCampaign.quota_used >= userCampaign.quota_limit) {
      return {
        ok: false,
        feature: featureKey,
        label: `${featureKey.replace('_', ' ')} campaign`,
        limit: userCampaign.quota_limit,
        count: userCampaign.quota_used,
        resetAt: null,
        plan: 'campaign'
      };
    }

    // Increment campaign usage
    await run(
      'UPDATE user_campaigns SET quota_used = quota_used + 1, updated_at = ? WHERE user_id = ? AND campaign_id IN (SELECT id FROM campaigns WHERE feature_key = ?)',
      [new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), user.id, featureKey]
    );

    return {
      ok: true,
      feature: featureKey,
      label: `${featureKey.replace('_', ' ')} campaign`,
      limit: userCampaign.quota_limit,
      count: userCampaign.quota_used + 1,
      resetAt: null,
      plan: 'campaign'
    };
  }

  const quota = getPlanQuota(featureKey, user.plan || 'free');
  if (!quota || quota.limit <= 0) return { ok: true };

  const key = `plan-quota:${featureKey}:${user.id}`;
  const existing = await getRateLimit(key);
  if (existing && existing.count >= quota.limit) {
    return {
      ok: false,
      feature: featureKey,
      label: quota.label,
      limit: quota.limit,
      count: existing.count,
      resetAt: existing.resetAt,
      plan: quota.plan
    };
  }

  const updated = await incrementRateLimit(key, quota.windowMs);
  return {
    ok: true,
    feature: featureKey,
    label: quota.label,
    limit: quota.limit,
    count: updated.count,
    resetAt: updated.resetAt,
    plan: quota.plan
  };
};

const buildPlanQuotaError = (quota) => {
  const planLabel = PLAN_LABELS[quota.plan] || quota.plan || PLAN_LABELS.free;
  return {
    error: `You've reached your ${quota.label} limit for ${planLabel}.`,
    quota: {
      feature: quota.feature,
      label: quota.label,
      limit: quota.limit,
      used: quota.count,
      resetAt: quota.resetAt,
      plan: quota.plan
    }
  };
};

const getPlanLimitsFromRow = (row) => {
  if (!row) {
    return {
      free: 0,
      go: 0,
      plus: 0,
      beta: 0
    };
  }
  const paidFallback = row.paid_limit ?? 0;
  return {
    free: row.free_limit ?? 0,
    go: row.go_limit ?? paidFallback,
    plus: row.plus_limit ?? paidFallback,
    beta: row.beta_limit ?? paidFallback
  };
};

const getPlanLimitForRow = (row, plan = 'free') => {
  const limits = getPlanLimitsFromRow(row);
  return limits[plan] ?? 0;
};

const PLAN_IDS = ['free', 'go', 'plus', 'beta'];

// Personal Knowledge base limits per plan
const PERSONAL_KNOWLEDGE_LIMITS = {
  free: 10,
  go: 200,
  plus: 500,
  beta: 1000
};

const PERSONAL_SKILLS_LIMITS = {
  free: 10,
  go: 200,
  plus: 500,
  beta: 1000
};

const getPersonalKnowledgeLimit = (plan = 'free') => {
  return PERSONAL_KNOWLEDGE_LIMITS[plan] ?? 2;
};

const getPersonalSkillsLimit = (plan = 'free') => {
  return PERSONAL_SKILLS_LIMITS[plan] ?? 2;
};

const parsePlanAccess = (planAccess) => {
  if (!planAccess) return PLAN_IDS;
  return planAccess
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => PLAN_IDS.includes(item));
};

const DEFAULT_MODEL_CATALOG = [
  {
    id: 'llama',
    provider: 'llama',
    label: 'Local',
    description: '',
    contextLength: '8k',
    pricing: 'Free',
    speedHint: 'Local'
  }
];

const LLAMA_SYSTEM_PROMPT = "You are ZygAI, a helpful and intelligent AI assistant. You are running locally on a Llama model. Be concise, accurate, and helpful. SYSTEM RULES: WHEN CREATING HTML, CSS OR JAVASCRIPT CODE: ALWAYS put ALL code in ONE SINGLE CODE BLOCK, DO NOT split into separate HTML, CSS, JS blocks. DO NOT write explanations, notes, or text around the code block. Use a single ```html block for the complete working code. Include all styles, scripts and markup inside this single HTML file. Always create complete, self-contained working code that runs directly. FILENAME RULES: When generating separate files, use ONLY these filenames: `index.html`, `styles.css`, and `index.js` (never use index.css or index.javascript).";

const MAX_PARSE_BYTES = 10 * 1024 * 1024;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const encodeBase32 = (buffer) => {
  if (!buffer || buffer.length === 0) return '';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
};

const decodeBase32 = (value) => {
  if (!value) return Buffer.alloc(0);
  const normalized = value.toUpperCase().replace(/=+$/g, '');
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
};

const generateTotpSecret = () => encodeBase32(randomBytes(10));

const buildOtpAuthUrl = (email, secret) => {
  const encodedEmail = encodeURIComponent(email || 'user');
  const encodedIssuer = encodeURIComponent('ZygAI');
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
};

const generateTotpToken = (secret, timestamp = Date.now()) => {
  if (!secret) return null;
  const key = decodeBase32(secret);
  if (!key.length) return null;
  const counter = BigInt(Math.floor(timestamp / 1000 / 30));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter, 0);
  const hmac = createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
};

const verifyTotpCode = (secret, code) => {
  const sanitized = (code || '').replace(/\s+/g, '');
  if (!secret || !sanitized) return false;
  for (let delta = -1; delta <= 1; delta += 1) {
    const check = generateTotpToken(secret, Date.now() + delta * 30000);
    if (check === sanitized) return true;
  }
  return false;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME = 80;
const MIN_DISPLAY_NAME = 2;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const validateEmail = (value) => {
  if (!value || typeof value !== 'string') {
    return 'Email required.';
  }
  const trimmed = value.trim();
  if (!trimmed) return 'Email required.';
  if (trimmed.length > MAX_EMAIL_LENGTH) return 'Email is too long.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Email looks invalid.';
  return null;
};

// Check if a string matches any active ban filters
const checkBanFilters = async (value, filterType = 'keyword') => {
  if (!value) return null;
  
  try {
    const filters = await all(
      `SELECT filter_value, is_regex FROM ban_filters 
       WHERE filter_type = ? AND active = 1`,
      [filterType]
    );

    const lowerValue = value.toLowerCase();
    for (const filter of filters) {
      let matches = false;
      if (filter.is_regex) {
        try {
          const regex = new RegExp(filter.filter_value, 'i');
          matches = regex.test(value);
        } catch (e) {
          console.error('Invalid regex filter:', filter.filter_value, e);
          continue;
        }
      } else {
        matches = lowerValue.includes(filter.filter_value.toLowerCase());
      }

      if (matches) {
        return `Your ${filterType === 'keyword' ? 'display name' : 'email'} contains prohibited content.`;
      }
    }
  } catch (error) {
    console.error('Ban filter check error:', error);
  }
  
  return null;
};

const validateDisplayName = (value) => {
  if (!value || typeof value !== 'string') {
    return 'Display name required.';
  }
  const trimmed = value.trim();
  if (trimmed.length < MIN_DISPLAY_NAME) return 'Display name is too short.';
  if (trimmed.length > MAX_DISPLAY_NAME) return 'Display name is too long.';
  return null;
};

const validatePassword = (value, options = {}) => {
  const { minLength = PASSWORD_MIN_LENGTH, maxLength = PASSWORD_MAX_LENGTH, fieldName = 'Password' } = options;
  if (!value || typeof value !== 'string') {
    return `${fieldName} required.`;
  }
  if (value.length < minLength) {
    return `${fieldName} must be at least ${minLength} characters.`;
  }
  if (value.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters.`;
  }
  return null;
};

const normalizeEmail = (value) => (value ? value.trim().toLowerCase() : '');

const buildModelCatalog = async () => {
  const rows = await all('SELECT * FROM model_catalog');
  if (!rows || rows.length === 0) {
    return DEFAULT_MODEL_CATALOG.map((model) => ({
      ...model,
      enabled: true
    }));
  }
  const defaultsById = new Map(DEFAULT_MODEL_CATALOG.map((model) => [model.id, model]));
  const catalog = rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label || defaultsById.get(row.id)?.label || row.id,
    description: row.description || defaultsById.get(row.id)?.description || '',
    contextLength: row.context_length || defaultsById.get(row.id)?.contextLength || '',
    pricing: row.pricing || defaultsById.get(row.id)?.pricing || '',
    speedHint: row.speed_hint || defaultsById.get(row.id)?.speedHint || '',
    enabled: row.enabled === 1
  }));
  DEFAULT_MODEL_CATALOG.forEach((model) => {
    if (!catalog.find((entry) => entry.id === model.id)) {
      catalog.push({ ...model, enabled: true });
    }
  });
  return catalog;
};

const loadPlanSettings = async () => {
  const rows = await all('SELECT id, enabled FROM plan_settings');
  if (!rows || rows.length === 0) {
    return DEFAULT_PLAN_SETTINGS;
  }
  const enabledMap = new Map(rows.map((row) => [row.id, row.enabled === 1]));
  return DEFAULT_PLAN_SETTINGS.map((plan) => ({
    id: plan.id,
    enabled: enabledMap.has(plan.id) ? enabledMap.get(plan.id) : plan.enabled
  }));
};

const loadApiToolServers = async (userId = null, includePublic = false) => {
  let query = 'SELECT * FROM mcp_servers';
  let params = [];
  
  if (userId) {
    if (includePublic) {
      query += ' WHERE user_id = ? OR user_id IS NULL OR is_public = 1';
      params.push(userId);
    } else {
      query += ' WHERE user_id = ? OR user_id IS NULL';
      params.push(userId);
    }
  } else if (includePublic) {
    query += ' WHERE user_id IS NULL OR is_public = 1';
  }

  query += ' ORDER BY name ASC';
  const rows = await all(query, params);
  
  return (rows || []).map((row) => {
    let config = {};
    if (row.config_encrypted) {
      try {
        const decryptedObj = JSON.parse(row.config_encrypted);
        if (decryptedObj.encrypted && decryptedObj.iv && decryptedObj.authTag) {
          config = decryptMessage(decryptedObj.encrypted, decryptedObj.iv, decryptedObj.authTag);
        }
      } catch (error) {
        console.error(`Failed to decrypt API tool config for ${row.name || row.id}:`, error.message);
      }
    }

    // Prioritize keys from .env if they match the server ID/Type (only for global servers)
    if (!row.user_id) {
      if (row.id === 'google-search' || row.name?.toLowerCase().includes('google search')) {
        if (process.env.GOOGLE_API_KEY) config.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
        if (process.env.GOOGLE_SEARCH_ENGINE_ID) config.GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
      }
    }

    return {
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      baseUrl: row.base_url,
      authHeader: row.auth_header || '',
      apiKey: row.api_key || '',
      headers: parseJsonFromText(row.headers_json) || {},
      enabled: row.enabled === 1,
      mcpJsonUrl: row.mcp_json_url || '',
      userId: row.user_id,
      isPublic: row.is_public === 1,
      config // decrypted sensitive data
    };
  });
};

const API_TOOL_PROTOCOL_VERSION = '2025-06-18';
const API_TOOL_CLIENT_INFO = {
  name: 'ZygAI',
  version: '0.1.0'
};

const buildApiToolHeaders = async (server, extraHeaders = {}) => {
  let config = {};
  if (server?.config_encrypted) {
    try {
      const decrypted = JSON.parse(server.config_encrypted);
      config = decryptMessage(decrypted.encrypted, decrypted.iv, decrypted.authTag);
    } catch (e) {
      console.error('[buildApiToolHeaders] Config decryption failed:', e.message);
    }
  }

  const headers = {
    'LCP-Protocol-Version': '2024-11-05',
    'MCP-Protocol-Version': API_TOOL_PROTOCOL_VERSION,
    ...(server?.headers && typeof server.headers === 'object' ? server.headers : {}),
    ...config,
    ...extraHeaders
  };

  if (server?.authHeader && server?.apiKey && !headers[server.authHeader]) {
    headers[server.authHeader] = server.apiKey;
  }

  return headers;
};

const getApiToolEndpointCandidates = async (server) => {
  const candidates = [];
  const pushCandidate = (value) => {
    if (!value || typeof value !== 'string') return;
    let trimmed = value.trim();
    if (trimmed.startsWith('/')) {
      trimmed = API_BASE_URL.replace(/\/$/, '') + trimmed;
    }
    if (!trimmed || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };

  pushCandidate(server?.baseUrl);

  if (server?.mcpJsonUrl) {
    try {
      const manifestResponse = await fetchWithTimeout(server.mcpJsonUrl, 5000, {
        headers: await buildApiToolHeaders(server)
      });
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json().catch(() => null);
        const entries = manifest?.mcpServers && typeof manifest.mcpServers === 'object'
          ? Object.values(manifest.mcpServers)
          : [];
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          pushCandidate(entry.url || entry.serverUrl || entry.baseUrl);
        }
      }
    } catch {
      // Ignore manifest discovery failures and fall back to stored URLs.
    }
  }

  const baseUrl = server?.baseUrl || '';
  if (baseUrl.includes('/sse')) {
    pushCandidate(baseUrl.replace(/\/sse\/?$/i, '/mcp'));
    pushCandidate(baseUrl.replace(/\/sse\/?$/i, ''));
  } else if (baseUrl && !baseUrl.startsWith('native:') && !/\/mcp\/?$/i.test(baseUrl)) {
    pushCandidate(`${baseUrl.replace(/\/$/, '')}/mcp`);
  }

  return candidates;
};

const parseJsonRpcResponseText = (text, requestId) => {
  if (!text) return null;

  const parsedCandidates = [];
  try {
    parsedCandidates.push(JSON.parse(text));
  } catch {
    const ssePayloads = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]');

    for (const payload of ssePayloads) {
      try {
        parsedCandidates.push(JSON.parse(payload));
      } catch {
        // Ignore non-JSON payloads.
      }
    }
  }

  for (const candidate of parsedCandidates) {
    if (Array.isArray(candidate)) {
      const match = candidate.find((entry) => entry && (entry.id === requestId || (requestId == null && (entry.result || entry.error))));
      if (match) return match;
      continue;
    }
    if (candidate && (candidate.id === requestId || (requestId == null && (candidate.result || candidate.error)))) {
      return candidate;
    }
  }

  return parsedCandidates[0] || null;
};

const mcpProcesses = new Map();

// Native Memory Implementation
const USER_MEMORY_DIR = path.join(process.cwd(), 'server', 'user_memory');
if (!fs.existsSync(USER_MEMORY_DIR)) {
  fs.mkdirSync(USER_MEMORY_DIR, { recursive: true });
}

const getMemoryFilePath = (userId, sessionId = null) => {
  if (sessionId) {
    return path.join(USER_MEMORY_DIR, `${userId}_${sessionId}.json`);
  }
  return path.join(USER_MEMORY_DIR, `${userId}.json`);
};

const loadUserMemory = (userId, sessionId = null) => {
  const filePath = getMemoryFilePath(userId, sessionId);
  if (!fs.existsSync(filePath)) return { entities: [], relationships: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to load memory for user ${userId}:`, err);
    return { entities: [], relationships: [] };
  }
};

const saveUserMemory = (userId, memory, sessionId = null) => {
  const filePath = getMemoryFilePath(userId, sessionId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save memory for user ${userId}:`, err);
  }
};

const handleNativeMemoryTool = async (userId, toolName, args, sessionId = null) => {
  const memory = loadUserMemory(userId, sessionId);
  
  if (toolName === 'store_memory') {
    const { fact, entities = [] } = args;
    if (!fact) return { error: 'No fact provided' };
    
    memory.entities.push({
      id: createId(),
      fact,
      tags: entities,
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')
    });
    
    saveUserMemory(userId, memory, sessionId);
    return { success: true, message: 'Fact remembered.' };
  }
  
  if (toolName === 'search_memory') {
    const { query } = args;
    if (!query) return { error: 'No query provided' };
    
    // Simple keyword search for now
    const results = memory.entities.filter(e => 
      e.fact.toLowerCase().includes(query.toLowerCase()) || 
      e.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
    
    return { results: results.slice(-10) };
  }

  if (toolName === 'get_all_memories') {
    return { results: memory.entities.slice(-50) };
  }
  
  throw new Error(`Unknown native memory tool: ${toolName}`);
};

const handleNativeNotesTool = async (userId, toolName, args) => {
  console.log(`[NativeNotesTool] Calling ${toolName} for user ${userId}`, args);
  if (toolName === 'create_note') {
    const { content, reminder_at } = args;
    if (!content) return { error: 'No content provided' };
    
    const id = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    await run(
      'INSERT INTO notes (id, user_id, content, reminder_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, content, reminder_at || null, now, now]
    );
    return { success: true, message: 'Note created.', noteId: id };
  }
  
  if (toolName === 'search_notes') {
    const { query } = args;
    const notes = await all(
      'SELECT * FROM notes WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC',
      [userId, `%${query || ''}%`]
    );
    return { results: notes };
  }

  if (toolName === 'delete_note') {
    const { id } = args;
    await run('DELETE FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
    return { success: true, message: 'Note deleted.' };
  }
  
  throw new Error(`Unknown native notes tool: ${toolName}`);
};

const handleNativeTasksTool = async (userId, toolName, args) => {
  console.log(`[NativeTasksTool] Calling ${toolName} for user ${userId}`, args);
  if (toolName === 'create_task') {
    const { title, due_at } = args;
    if (!title) return { error: 'No title provided' };
    
    const id = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    await run(
      'INSERT INTO tasks (id, user_id, title, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, title, 'pending', due_at || null, now, now]
    );
    return { success: true, message: 'Task created.', taskId: id };
  }
  
  if (toolName === 'list_tasks') {
    const tasks = await all(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return { results: tasks };
  }

  if (toolName === 'update_task') {
    const { id, status, title } = args;
    await run(
      'UPDATE tasks SET status = COALESCE(?, status), title = COALESCE(?, title), updated_at = ? WHERE id = ? AND user_id = ?',
      [status, title, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), id, userId]
    );
    return { success: true, message: 'Task updated.' };
  }

  if (toolName === 'delete_task') {
    const { id } = args;
    await run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, userId]);
    return { success: true, message: 'Task deleted.' };
  }
  
  throw new Error(`Unknown native tasks tool: ${toolName}`);
};

const handleLocalMcpRequest = async ({ server, command, request, timeoutMs }) => {
  let serverProcess = mcpProcesses.get(server.id);
  
  if (!serverProcess || serverProcess.proc.killed) {
    // Spawn new process
    try {
      const env = { ...process.env, ...(server.config || {}) };
      // For server-shell, we might want to pass ALLOWED_DIRECTORIES as args
      let finalCommand = command;
      if (command.includes('server-shell') && server.config?.ALLOWED_DIRECTORIES) {
        finalCommand += ` ${server.config.ALLOWED_DIRECTORIES.split(',').join(' ')}`;
      }
      // For server-memory, we might want to pass path
      if (command.includes('server-memory') && server.config?.MEMORY_FILE_PATH) {
        finalCommand += ` "${server.config.MEMORY_FILE_PATH}"`;
      }

      const proc = spawn(finalCommand, { shell: true, env });
      
      serverProcess = {
        proc,
        stdout: '',
        stderr: '',
        pendingRequests: new Map()
      };

      proc.stdout.on('data', (data) => {
        serverProcess.stdout += data.toString();
        // Try to parse full JSON-RPC messages from stdout (assuming line-buffered or similar)
        const lines = serverProcess.stdout.split('\n');
        serverProcess.stdout = lines.pop(); // Keep partial line
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.id && serverProcess.pendingRequests.has(response.id)) {
              const { resolve } = serverProcess.pendingRequests.get(response.id);
              serverProcess.pendingRequests.delete(response.id);
              resolve({ parsed: response });
            }
          } catch (e) {
            // Not a full JSON yet or multi-line?
            // Some servers might not use newlines. Let's try to find balanced braces.
            // But line-buffered is standard for Stdio MCP.
          }
        }
      });

      proc.stderr.on('data', (data) => {
        serverProcess.stderr += data.toString();
        if (serverProcess.stderr.length > 1000) serverProcess.stderr = serverProcess.stderr.slice(-1000);
      });

      proc.on('exit', () => {
        mcpProcesses.delete(server.id);
        // Reject all pending
        for (const { reject } of serverProcess.pendingRequests.values()) {
          reject(new Error(`MCP process ${server.name} exited unexpectedly: ${serverProcess.stderr}`));
        }
      });

      mcpProcesses.set(server.id, serverProcess);
    } catch (error) {
      throw new Error(`Failed to spawn MCP server ${server.name}: ${error.message}`);
    }
  }

  // Send request
  return new Promise((resolve, reject) => {
    const requestId = request.id || createId();
    const fullRequest = { ...request, id: requestId };
    
    const timeout = setTimeout(() => {
      serverProcess.pendingRequests.delete(requestId);
      reject(new Error(`MCP request timeout after ${timeoutMs}ms: ${serverProcess.stderr}`));
    }, timeoutMs);

    serverProcess.pendingRequests.set(requestId, {
      resolve: (res) => {
        clearTimeout(timeout);
        resolve(res);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    serverProcess.proc.stdin.write(JSON.stringify(fullRequest) + '\n');
  });
};

const postApiToolJsonRpc = async ({ server, endpoint, request, sessionId, timeoutMs = 15000 }) => {
  // Check if endpoint is a local command (npx, etc.)
  const isCommand = endpoint && (endpoint.startsWith('npx') || (!endpoint.startsWith('http') && endpoint.includes(' ')));
  
  if (isCommand) {
    try {
      // Local commands are deprecated for discoverable tools to ensure security
      console.warn(`[API Tool] Executing local command for ${server.name || server.id}: ${endpoint}`);
      const result = await handleLocalMcpRequest({ server, command: endpoint, request, timeoutMs });
      return {
        endpoint,
        sessionId: null,
        parsed: result.parsed
      };
    } catch (error) {
      throw new Error(`Local API tool execution failed: ${error.message}`);
    }
  }

  const headers = await buildApiToolHeaders(server, {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Method': request.method
  });

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }
  if (request?.params?.name) {
    headers['Mcp-Name'] = request.params.name;
  }

  const response = await fetchWithTimeout(endpoint, timeoutMs, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });

  const text = await response.text().catch(() => '');
  const nextSessionId = response.headers.get('mcp-session-id') || sessionId || null;

  if (!response.ok) {
    const message = text || `HTTP ${response.status}`;
    throw new Error(`API Tool request failed at ${endpoint}: ${message}`);
  }

  const parsed = parseJsonRpcResponseText(text, request.id);
  if (parsed?.error) {
    throw new Error(parsed.error.message || `API Tool ${request.method} failed.`);
  }

  return {
    endpoint,
    sessionId: nextSessionId,
    response,
    parsed
  };
};

const initializeApiToolConnection = async (server) => {
  const candidates = await getApiToolEndpointCandidates(server);
  let lastError = null;

  for (const endpoint of candidates) {
    try {
      const initializeRequest = {
        jsonrpc: '2.0',
        id: createId(),
        method: 'initialize',
        params: {
          protocolVersion: API_TOOL_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: API_TOOL_CLIENT_INFO
        }
      };

      const initialized = await postApiToolJsonRpc({
        server,
        endpoint,
        request: initializeRequest,
        timeoutMs: 12000
      });

      try {
        await postApiToolJsonRpc({
          server,
          endpoint,
          sessionId: initialized.sessionId,
          request: {
            jsonrpc: '2.0',
            method: 'notifications/initialized'
          },
          timeoutMs: 8000
        });
      } catch {
        // Some servers do not require or return anything for this notification.
      }

      return {
        server,
        endpoint,
        sessionId: initialized.sessionId
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Unable to connect to API Tool server ${server?.name || server?.id || server?.baseUrl || ''}`);
};

const listApiTools = async (server) => {
  const connection = await initializeApiToolConnection(server);
  const result = await postApiToolJsonRpc({
    server,
    endpoint: connection.endpoint,
    sessionId: connection.sessionId,
    request: {
      jsonrpc: '2.0',
      id: createId(),
      method: 'tools/list',
      params: {}
    }
  });

  return {
    ...connection,
    tools: Array.isArray(result?.parsed?.result?.tools) ? result.parsed.result.tools : []
  };
};

const callApiTool = async (connection, toolName, args) => {
  const result = await postApiToolJsonRpc({
    server: connection.server,
    endpoint: connection.endpoint,
    sessionId: connection.sessionId,
    request: {
      jsonrpc: '2.0',
      id: createId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args && typeof args === 'object' ? args : {}
      }
    },
    timeoutMs: 30000
  });

  return result?.parsed?.result || {};
};

const extractApiToolText = (result) => {
  if (!result) return 'Tool completed with no output.';

  const textContent = Array.isArray(result.content)
    ? result.content
        .map((item) => {
          if (item?.type === 'text' && typeof item.text === 'string') return item.text;
          if (item?.type === 'resource' && typeof item.resource?.text === 'string') return item.resource.text;
          if (item?.type === 'resource_link' && item.uri) return `${item.name || 'Resource'}: ${item.uri}`;
          return null;
        })
        .filter(Boolean)
        .join('\n\n')
    : '';

  if (textContent) return textContent;
  if (result.structuredContent) return JSON.stringify(result.structuredContent, null, 2);
  return JSON.stringify(result, null, 2);
};

const buildApiToolName = (server, toolName) => {
  const serverKey = slugify(server?.name || server?.id || 'api').replace(/-/g, '_') || 'api';
  const toolKey = String(toolName || 'tool').replace(/[^a-zA-Z0-9_]/g, '_');
  return `api_${serverKey}_${toolKey}`.slice(0, 64);
};

const normalizeToolSchema = (inputSchema) => {
  if (inputSchema && typeof inputSchema === 'object') {
    if (inputSchema.type === 'object') {
      return inputSchema;
    }
    return {
      type: 'object',
      properties: {
        value: inputSchema
      }
    };
  }

  return {
    type: 'object',
    properties: {},
    additionalProperties: true
  };
};

const discoverApiToolsForChat = async (selectedServerIds = null, userId = null, sessionId = null) => {
  const allServers = await loadApiToolServers();
  
  // Logic: 
  // 1. If selectedServerIds is provided and not empty, use only those.
  // 2. If selectedServerIds is null, include all enabled servers (legacy behavior).
  // 3. If selectedServerIds is an empty array [], don't include external servers by default.
  let servers = [];
  if (selectedServerIds && selectedServerIds.length > 0) {
    servers = allServers.filter((server) => server.enabled && selectedServerIds.includes(server.id));
  } else if (selectedServerIds === null) {
    servers = allServers.filter((server) => server.enabled);
  }

  const registry = new Map();
  const tools = [];

  // Inject Native Memory Tools
  if (userId) {
    const nativeTools = [
      {
        name: 'store_memory',
        description: 'Remember a fact, preference, or piece of information about the user for this conversation.',
        inputSchema: {
          type: 'object',
          properties: {
            fact: { type: 'string', description: 'The information to remember.' },
            entities: { type: 'array', items: { type: 'string' }, description: 'Key entities or tags related to this fact.' }
          },
          required: ['fact']
        }
      },
      {
        name: 'search_memory',
        description: 'Search through the current conversation\'s memory for relevant facts or information.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search term or topic to look up.' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_all_memories',
        description: 'Retrieve a list of recent memories from this conversation.',
        inputSchema: { type: 'object', properties: {} }
      }
    ];

    for (const tool of nativeTools) {
      const publicName = `native_memory_${tool.name}`;
      registry.set(publicName, {
        isNative: true,
        type: 'memory',
        toolName: tool.name,
        userId,
        sessionId
      });
      tools.push({
        type: 'function',
        function: {
          name: publicName,
          description: `[Memory] ${tool.description}`,
          parameters: tool.inputSchema
        }
      });
    }
  }

  // Inject Native Notes Tools
  if (userId) {
    const noteTools = [
      {
        name: 'create_note',
        description: 'Create a new note or reminder for the user. Use this if the user says "remember I need to buy milk" or "remind me tomorrow about the dentist".',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The content of the note or reminder.' },
            reminder_at: { type: 'string', description: 'Optional: ISO 8601 timestamp for a reminder (e.g. 2024-05-22T10:00:00Z).' }
          },
          required: ['content']
        }
      },
      {
        name: 'search_notes',
        description: 'Search through the user\'s notes and reminders.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search term to look for in notes.' }
          }
        }
      },
      {
        name: 'delete_note',
        description: 'Delete a note by its ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The ID of the note to delete.' }
          },
          required: ['id']
        }
      }
    ];

    for (const tool of noteTools) {
      const publicName = `native_notes_${tool.name}`;
      registry.set(publicName, {
        isNative: true,
        type: 'notes',
        toolName: tool.name,
        userId
      });
      tools.push({
        type: 'function',
        function: {
          name: publicName,
          description: `[Notes] ${tool.description}`,
          parameters: tool.inputSchema
        }
      });
    }

    // Inject Native Task Tools
    const taskTools = [
      {
        name: 'create_task',
        description: 'Create a new task or todo for the user.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The title of the task.' },
            due_at: { type: 'string', description: 'Optional: ISO 8601 timestamp for a due date.' }
          },
          required: ['title']
        }
      },
      {
        name: 'list_tasks',
        description: 'List the user\'s tasks.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'update_task',
        description: 'Update a task\'s status or title.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The ID of the task.' },
            status: { type: 'string', enum: ['pending', 'completed'], description: 'The new status.' },
            title: { type: 'string', description: 'The new title.' }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_task',
        description: 'Delete a task.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The ID of the task to delete.' }
          },
          required: ['id']
        }
      }
    ];

    for (const tool of taskTools) {
      const publicName = `native_tasks_${tool.name}`;
      registry.set(publicName, {
        isNative: true,
        type: 'tasks',
        toolName: tool.name,
        userId
      });
      tools.push({
        type: 'function',
        function: {
          name: publicName,
          description: `[Tasks] ${tool.description}`,
          parameters: tool.inputSchema
        }
      });
    }
  }

  await Promise.all(
    servers.map(async (server) => {
      if (server.baseUrl === 'native:memory') return; // Handled above
      try {
        const connection = await listApiTools(server);
        for (const tool of connection.tools) {
          if (!tool?.name) continue;
          const publicName = buildApiToolName(server, tool.name);
          registry.set(publicName, {
            connection,
            toolName: tool.name,
            displayName: tool.title || tool.name,
            serverName: server.name || server.id || 'API'
          });
          tools.push({
            type: 'function',
            function: {
              name: publicName,
              description: `[${server.name || server.id || 'API'}] ${tool.description || tool.title || tool.name}`,
              parameters: normalizeToolSchema(tool.inputSchema)
            }
          });
        }
      } catch (error) {
        console.warn(`[API Tool] Failed to load tools for ${server.name || server.id}: ${error.message}`);
      }
    })
  );

  return { tools, registry };
};

const executeChatToolCall = async (toolCall, apiToolRegistry) => {
  const name = toolCall?.function?.name || '';
  console.log(`[ToolCall] Executing: ${name}`, toolCall.function?.arguments);
  let args = {};
  try {
    args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch (error) {
    throw new Error(`Invalid tool arguments for ${name}: ${error.message}`);
  }

  if (name === 'web_search') {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return 'Search query was empty.';
    }
    const results = await callExa(query);
    return results.length > 0
      ? results
          .slice(0, 5)
          .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet || ''}`.trim())
          .join('\n\n')
      : 'No web results found.';
  }

  const apiTool = apiToolRegistry.get(name);
  if (!apiTool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  if (apiTool.isNative) {
    if (apiTool.type === 'memory') {
      const result = await handleNativeMemoryTool(apiTool.userId, apiTool.toolName, args, apiTool.sessionId);
      return JSON.stringify(result);
    }
    if (apiTool.type === 'notes') {
      const result = await handleNativeNotesTool(apiTool.userId, apiTool.toolName, args);
      return JSON.stringify(result);
    }
    if (apiTool.type === 'tasks') {
      const result = await handleNativeTasksTool(apiTool.userId, apiTool.toolName, args);
      return JSON.stringify(result);
    }
  }

  const result = await callApiTool(apiTool.connection, apiTool.toolName, args);
  return extractApiToolText(result);
};

const CLUSTER_HEALTH_TTL_MS = 10000;
const clusterHealth = new Map();
const clusterInFlight = new Map();
const API_TOOL_HEALTH_TTL_MS = 10000;
const apiToolHealth = new Map();

const fetchClusterNodes = async () => {
  const rows = await all(
      'SELECT id, name, base_url, display_name, model_id, priority, max_concurrent, enabled FROM ollama_cluster_nodes'
  );
  return rows
      .filter((row) => row.enabled === 1)
      .map((row) => ({
        id: row.id,
        name: row.name || row.id,
        baseUrl: row.base_url,
        displayName: row.display_name || '',
        modelId: row.model_id || '',
        priority: Number.isFinite(row.priority) ? row.priority : 1,
        maxConcurrent: Number.isFinite(row.max_concurrent) ? row.max_concurrent : 1
      }))
      .sort((a, b) => a.priority - b.priority);
};



const checkClusterHealth = async (baseUrl) => {
  const now = Date.now();
  const cached = clusterHealth.get(baseUrl);
  if (cached && now - cached.checkedAt < CLUSTER_HEALTH_TTL_MS) {
    return cached.ok;
  }
  try {
    const url = baseUrl.replace(/\/$/, '') + '/v1/models';
    const response = await fetchWithTimeout(url, 3000);
    const ok = response.ok;
    clusterHealth.set(baseUrl, { ok, checkedAt: now });
    return ok;
  } catch {
    clusterHealth.set(baseUrl, { ok: false, checkedAt: now });
    return false;
  }
};

const checkApiToolHealth = async (server) => {
  const baseUrl = server?.baseUrl;
  if (!baseUrl) {
    return { status: 'unhealthy', checkedAt: Date.now(), mcpJsonStatus: 'missing' };
  }
  const now = Date.now();
  const cacheKey = `${baseUrl}-${server.mcpJsonUrl || ''}`;
  const cached = apiToolHealth.get(cacheKey);
  if (cached && now - cached.checkedAt < API_TOOL_HEALTH_TTL_MS) {
    return cached;
  }
  let status = 'unhealthy';
  let mcpJsonStatus = 'not_configured';

  // First, check the main health endpoint
  try {
    const url = baseUrl.replace(/\/$/, '') + '/health';
    const headers = await buildApiToolHeaders(server);
    const response = await fetchWithTimeout(url, 3000, {
      headers: Object.keys(headers).length ? headers : undefined
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        const normalized =
            typeof data?.status === 'string' ? data.status.toLowerCase() : '';
        if (['healthy', 'ok', 'ready', 'up'].includes(normalized)) {
          status = 'healthy';
        } else if (['unhealthy', 'error', 'down', 'failed'].includes(normalized)) {
          status = 'unhealthy';
        } else {
          status = 'connected';
        }
      } else {
        status = 'connected';
      }
    } else if (response.status === 404 || response.status === 405) {
      const fallback = await fetchWithTimeout(baseUrl.replace(/\/$/, ''), 3000, {
        headers: Object.keys(headers).length ? headers : undefined
      });
      status = fallback.ok ? 'connected' : 'unhealthy';
    }
  } catch {
    status = 'unhealthy';
  }

  // Then, check mcp.json if configured
  if (server.mcpJsonUrl) {
    try {
      const mcpJsonHeaders = await buildApiToolHeaders(server);
      const mcpJsonResponse = await fetchWithTimeout(server.mcpJsonUrl, 5000, {
        headers: Object.keys(mcpJsonHeaders).length ? mcpJsonHeaders : undefined
      });
      if (mcpJsonResponse.ok) {
        const contentType = mcpJsonResponse.headers.get('content-type') || '';
        const text = await mcpJsonResponse.text().catch(() => '');

        // Try to parse as JSON and validate it has required MCP fields
        try {
          const mcpData = JSON.parse(text);
          // Valid mcp.json should have at least tools, resources, or prompts
          const hasValidContent = (
              (Array.isArray(mcpData.tools) && mcpData.tools.length > 0) ||
              (Array.isArray(mcpData.resources) && mcpData.resources.length > 0) ||
              (Array.isArray(mcpData.prompts) && mcpData.prompts.length > 0) ||
              (typeof mcpData.mcpServers === 'object' && Object.keys(mcpData.mcpServers).length > 0)
          );
          if (hasValidContent) {
            mcpJsonStatus = 'valid';
          } else {
            mcpJsonStatus = 'invalid';
          }
        } catch {
          mcpJsonStatus = 'invalid';
        }
      } else if (mcpJsonResponse.status === 404) {
        mcpJsonStatus = 'not_found';
      } else {
        mcpJsonStatus = 'error';
      }
    } catch {
      mcpJsonStatus = 'error';
    }
  }

  const entry = { status, checkedAt: now, mcpJsonStatus };
  apiToolHealth.set(cacheKey, entry);
  return entry;
};

const getDisplayNameForModelId = async (modelId) => {
  if (!modelId) return '';
  const normalized = normalizeLlamaModelId(modelId);
  if (!normalized) return '';
  if (modelId === 'llama' || normalized === 'llama') {
    const llamaConfig = await get('SELECT name FROM llama_settings WHERE id = 1');
    return llamaConfig?.name || 'ZygAI F';
  }

  // Check model_configs first (by ID)
  const configRow = await get('SELECT name FROM model_configs WHERE id = ?', [modelId]);
  if (configRow?.name) return configRow.name;

  const ollamaRow = await get(
      'SELECT label FROM ollama_models WHERE model_id = ?',
      [normalized]
  );
  if (ollamaRow?.label) return ollamaRow.label;
  const catalogRow = await get(
      'SELECT label FROM model_catalog WHERE id = ?',
      [modelId]
  );
  return catalogRow?.label || '';
};

const acquireClusterNode = async (modelId) => {
  const normalizedModelId = normalizeLlamaModelId(modelId);
  const requestedDisplayName = await getDisplayNameForModelId(modelId);
  const nodes = await fetchClusterNodes();
  const matchingNodes = nodes.filter((node) => {
    if (!normalizedModelId) return false;
    if (!node.modelId) return false;
    return normalizeLlamaModelId(node.modelId) === normalizedModelId;
  });
  const displayNameNodes = requestedDisplayName
      ? nodes.filter(
          (node) =>
              node.displayName &&
              node.displayName.toLowerCase() === requestedDisplayName.toLowerCase()
      )
      : [];
  const candidates =
      matchingNodes.length > 0
          ? matchingNodes
          : displayNameNodes.length > 0
              ? displayNameNodes
              : nodes;
  if (candidates.length === 0) return null;
  for (const node of candidates) {
    const ok = await checkClusterHealth(node.baseUrl);
    if (!ok) continue;
    const inFlight = clusterInFlight.get(node.baseUrl) || 0;
    if (inFlight >= node.maxConcurrent) continue;
    clusterInFlight.set(node.baseUrl, inFlight + 1);
    const resolvedModelId = node.modelId ? normalizeLlamaModelId(node.modelId) : '';
    return {
      baseUrl: node.baseUrl,
      modelId: resolvedModelId,
      release: () => {
        const current = clusterInFlight.get(node.baseUrl) || 1;
        clusterInFlight.set(node.baseUrl, Math.max(0, current - 1));
      }
    };
  }
  return null;
};

const loadFeatureModelSettings = async () => {
  const rows = await all(
      'SELECT feature_key, provider, model_id, system_prompt FROM feature_model_settings'
  );
  const optionRows = await all(
      'SELECT feature_key, provider, model_id, label, position FROM feature_model_options ORDER BY feature_key, position ASC'
  ).catch(() => []);
  const optionMap = new Map();
  for (const option of optionRows) {
    const list = optionMap.get(option.feature_key) || [];
    list.push({
      provider: option.provider,
      modelId: option.model_id,
      label: option.label || undefined
    });
    optionMap.set(option.feature_key, list);
  }
  const parseFeatureModelOptions = (featureKey, provider, rawModelId) => {
    if (!rawModelId || typeof rawModelId !== 'string') return [];
    if (featureKey !== 'vibe_coder') {
      return [{ provider, modelId: rawModelId, label: rawModelId }];
    }
    try {
      const parsed = JSON.parse(rawModelId);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => ({
            provider: typeof entry?.provider === 'string' && entry.provider.trim() ? entry.provider.trim() : provider,
            modelId: typeof entry?.modelId === 'string' ? entry.modelId.trim() : '',
            label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : undefined
          }))
          .filter((entry) => entry.modelId);
      }
    } catch {}
    return rawModelId
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((modelId) => ({ provider, modelId, label: modelId }));
  };
  const rowMap = new Map(
      rows.map((row) => [
        row.feature_key,
        (() => {
          const persistedOptions = optionMap.get(row.feature_key) || [];
          const modelOptions = persistedOptions.length
            ? persistedOptions
            : parseFeatureModelOptions(row.feature_key, row.provider, row.model_id);
          const modelIds = modelOptions.map((option) => option.modelId);
          const defaultOption = modelOptions.find((option) => option.modelId === row.model_id) ||
            modelOptions[0] ||
            { provider: row.provider, modelId: row.model_id };
          return {
          featureKey: row.feature_key,
          provider: defaultOption.provider,
          modelId: defaultOption.modelId,
          model_id: defaultOption.modelId,
          modelIds,
          modelOptions,
          systemPrompt: row.system_prompt || ''
          };
        })()
      ])
  );
  const settings = DEFAULT_FEATURE_MODELS.map((entry) => ({
    ...entry,
    ...(rowMap.get(entry.featureKey) || {})
  }));

  // Validate model references for non-llama providers (debug logging only)
  for (const setting of settings) {
    if (setting.provider !== 'llama' && setting.model_id && setting.model_id.startsWith('m-')) {
      console.warn(`[FeatureModel] ${setting.featureKey} uses m- model ID ${setting.model_id} - will be resolved at runtime`);
    }
  }

  return settings;
};

const getFeatureModel = async (featureKey) => {
  const settings = await loadFeatureModelSettings();
  return settings.find((entry) => entry.featureKey === featureKey) || null;
};

const normalizeLlamaModelId = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.startsWith('ollama:') ? value.slice('ollama:'.length) : value;
};
const CALM_MODE_SUPPORT_MESSAGE =
    process.env.CALM_MODE_SUPPORT_MESSAGE ||
    "I want to be very clear about one important thing. If you feel like you might hurt yourself, or that things are becoming too overwhelming, ZygAI cannot replace real human help. You are not alone. Please contact emergency services immediately (112 / 911), or reach out to a crisis support service right now. You can find international crisis hotlines here: https://findahelpline.com If you are in the United States or Canada: Call or text 988 — Suicide & Crisis Lifeline https://988lifeline.org If you can, please also consider reaching out to someone you trust and let them know you need help. I can stay here and support you, but in moments like this, real human support is essential.";
const ALERT_THROTTLE_MS = 30 * 60 * 1000;
const alertThrottle = new Map();

const sendAdminAlert = async (key, subject, text) => {
  if (!ALERT_EMAIL) return;
  const now = Date.now();
  const lastSent = alertThrottle.get(key) || 0;
  if (now - lastSent < ALERT_THROTTLE_MS) return;
  alertThrottle.set(key, now);
  try {
    await sendEmail({
      to: ALERT_EMAIL,
      subject,
      text
    });
  } catch (error) {
    console.error('Admin alert email failed:', error);
  }
};

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  sendAdminAlert('unhandled-rejection', 'ZygAI server unhandled rejection', message);
});

process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  sendAdminAlert('uncaught-exception', 'ZygAI server uncaught exception', message);
});

const extractTextFromPdf = async (buffer, fileName) => {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer is empty');
  }
  // Validate PDF magic bytes (should start with %PDF-)
  const pdfHeader = buffer.slice(0, 5).toString('ascii');
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error('Invalid PDF format: file does not start with %PDF- header');
  }
  try {
    const parsed = await pdfParse(buffer);
    if (!parsed || !parsed.text) {
      return '';
    }
    return parsed.text.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF parsing failed';
    // Enhance error with more context
    const enhanced = new Error(`Failed to parse PDF "${fileName || 'unknown'}": ${message}`);
    enhanced.originalError = error;
    throw enhanced;
  }
};
const fetchWithTimeout = async (url, timeoutMs = 4000, options = {}) => {
  console.log(`[fetchWithTimeout] Starting fetch to ${url} with timeout ${timeoutMs}ms`);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error(`[fetchWithTimeout] Timeout triggered for ${url}`);
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    console.log(`[fetchWithTimeout] Fetch response received for ${url}: ${response.status}`);
    return response;
  } catch (error) {
    console.error(`[fetchWithTimeout] Fetch error for ${url}:`, error.message);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// Cloudflare Workers AI - Markdown Conversion
const convertToMarkdown = async (buffer, fileName, mimeType, options = {}) => {
  const startTime = Date.now();
  console.log(`[CloudflareMarkdown] Starting conversion for: ${fileName}, type: ${mimeType}, size: ${buffer.length} bytes`);

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare Workers AI credentials not configured.');
  }

  // Generate a random boundary for multipart form data
  const boundary = '----CloudflareBoundary' + Math.random().toString(36).substring(2);
  
  // Build multipart body manually to ensure correct format
  let body = '';
  
  // File part
  const filename = fileName || 'document';
  const contentType = mimeType || 'application/octet-stream';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n`;
  body += `Content-Type: ${contentType}\r\n\r\n`;
  
  // Convert buffer to base64 to safely embed in string, then reconstruct as Buffer
  // Actually, we need to construct a proper Buffer multipart body
  const contentParts = [];
  const headerBuffer = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  contentParts.push(headerBuffer);
  contentParts.push(Buffer.from(buffer));
  
  // Add conversion options if provided
  if (Object.keys(options).length > 0) {
    const optionsJson = JSON.stringify(options);
    const optionsHeader = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="conversionOptions"\r\n` +
      `Content-Type: application/json\r\n\r\n`
    );
    const optionsBody = Buffer.from(optionsJson);
    contentParts.push(optionsHeader);
    contentParts.push(optionsBody);
  }
  
  // Closing boundary
  const closingBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
  contentParts.push(closingBoundary);
  
  // Combine all parts
  const bodyBuffer = Buffer.concat(contentParts);
  
  console.log(`[CloudflareMarkdown] Sending request to ${CLOUDFLARE_TOMARKDOWN_URL}`);
  console.log(`[CloudflareMarkdown] Multipart body size: ${bodyBuffer.length} bytes`);
  
  try {
    const response = await fetchWithTimeout(CLOUDFLARE_TOMARKDOWN_URL, 60000, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      },
      body: bodyBuffer
    });
    console.log(`[CloudflareMarkdown] fetchWithTimeout returned`);

    console.log(`[CloudflareMarkdown] Response status: ${response.status} (${Date.now() - startTime}ms)`);

    if (!response.ok) {
      console.log(`[CloudflareMarkdown] Response not ok, reading body`);
      const errorData = await response.json().catch(() => ({}));
      console.error(`[CloudflareMarkdown] Response not ok:`, errorData);
      throw new Error(errorData?.errors?.[0]?.message || `Cloudflare conversion failed: ${response.status}`);
    }

    console.log(`[CloudflareMarkdown] Response ok, reading JSON`);
    const data = await response.json();
    console.log(`[CloudflareMarkdown] Received JSON response`);

    if (!data.success) {
      console.error(`[CloudflareMarkdown] Success false:`, data);
      throw new Error(data.errors?.[0]?.message || 'Cloudflare conversion failed.');
    }

    const result = data.result?.[0];
    if (!result) {
      console.error(`[CloudflareMarkdown] No result in response:`, data);
      throw new Error('No conversion result returned.');
    }

    if (result.format === 'error') {
      console.error(`[CloudflareMarkdown] Result format is error:`, result.error);
      throw new Error(result.error || 'File conversion failed.');
    }

    console.log(`[CloudflareMarkdown] Conversion successful in ${Date.now() - startTime}ms`);
    return {
      text: result.data || '',
      tokens: result.tokens || 0,
      format: result.format
    };
  } catch (error) {
    console.error(`[CloudflareMarkdown] Exception during conversion (${Date.now() - startTime}ms):`, error.message);
    throw error;
  }
};

const buildLlamaPayload = (messages, instance) => ({
  model: instance.modelId || 'local-model',
  messages,
  temperature: instance.temperature,
  max_tokens: instance.maxTokens,
  top_p: instance.topP
});

const callLlama = async (instance, messages, customSystemPrompt) => {
  const baseUrl = instance.baseUrl.replace(/\/$/, '');
  const url = baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
  let response;

    const systemMessage = { role: 'system', content: customSystemPrompt || LLAMA_SYSTEM_PROMPT };
    
    // Check if any message contains images (for Ollama format handling)
    const hasImages = messages.some(msg => Array.isArray(msg.images) && msg.images.length > 0);
    
    let modelMessages;
    if (hasImages) {
      // For vision models, Ollama can have issues with system message as first message
      // Prepend system prompt to first user message instead
      modelMessages = messages.map((msg, index) => {
        if (index === 0 && msg.role === 'user') {
          return {
            ...msg,
            content: `${customSystemPrompt || LLAMA_SYSTEM_PROMPT}\n\n${msg.content}`
          };
        }
        return msg;
      });
    } else {
      // Normal format without images
      modelMessages = [systemMessage, ...messages];
    }

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildLlamaPayload(modelMessages, instance))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Fetch to ${url} failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Llama.cpp instance failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

const createId = () =>
    typeof randomUUID === 'function'
        ? randomUUID()
        : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const slugify = (value) =>
    (value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

const parseJsonFromText = (value) => {
  if (!value) return null;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
};

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

const createVerificationToken = () => randomBytes(32).toString('hex');

const buildVerificationExpiry = () => new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();

app.get('/api/public/user-count', async (req, res) => {
  try {
    const row = await get('SELECT COUNT(*) as count FROM users');
    res.json({ count: row.count || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/public/user/:idOrEmail/info', async (req, res) => {
  const { idOrEmail } = req.params;
  try {
    const user = await get('SELECT display_name, email FROM users WHERE id = ? OR email = ?', [idOrEmail, idOrEmail]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ displayName: user.display_name || user.email.split('@')[0] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { email, password, accessCode, displayName } = req.body;
  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });
  const passwordError = validatePassword(password, { fieldName: 'Password' });
  if (passwordError) return res.status(400).json({ error: passwordError });
  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) return res.status(400).json({ error: displayNameError });
  
  // Check ban filters for display name
  const displayNameBanError = await checkBanFilters(displayName, 'keyword');
  if (displayNameBanError) return res.status(400).json({ error: displayNameBanError });
  
  // Check ban filters for email domain
  const emailBanError = await checkBanFilters(email, 'email_pattern');
  if (emailBanError) return res.status(400).json({ error: emailBanError });
  
  const normalizedDisplayName = displayName.trim();
  const normalizedEmail = normalizeEmail(email);
  const existing = await get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'Email already in use.' });

  const passwordHash = await hashPassword(password);
  const userId = createId();
  const role = isAdminEmail(normalizedEmail) ? 'admin' : 'user';
  const verificationToken = createVerificationToken();
  const verificationSentAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const verificationExpiresAt = buildVerificationExpiry();

  let referrerId = null;
  if (accessCode && typeof accessCode === 'string') {
    const referrer = await get('SELECT id FROM users WHERE id = ? OR email = ?', [accessCode.trim(), accessCode.trim()]);
    if (referrer) {
      referrerId = referrer.id;
    }
  }

  await run(
      `INSERT INTO users
      (id, email, display_name, password_hash, plan, role, email_verified, email_verification_token, email_verification_sent_at, email_verification_expires_at, created_at, referred_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        normalizedEmail,
        normalizedDisplayName,
        passwordHash,
        'free',
        role,
        0,
        verificationToken,
        verificationSentAt,
        verificationExpiresAt,
        new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '),
        referrerId
      ]
  );
  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (error) {
    console.error('Verification email failed:', error);
  }

  res.setHeader('Content-Type', 'application/json');
  return res.json({
    pendingVerification: true,
    email
  });
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password, totpCode } = req.body;
  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });
  const passwordError = validatePassword(password, { minLength: 1, fieldName: 'Password' });
  if (passwordError) return res.status(400).json({ error: passwordError });
  const normalizedEmail = normalizeEmail(email);
  const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

  if (!user || !user.password_hash) {
    // Dummy bcrypt comparison to prevent timing-based user enumeration
    await verifyPassword(password, '$2a$12$LQv3c1yqSNVHxBm5We12WuM3CMyZ4DntXJz.3B5xXl0sXyvM2wT4m');
    if (user && !user.password_hash) console.warn('Login attempt for user without password hash:', user.email);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  let valid = false;
  try {
    valid = await verifyPassword(password, user.password_hash);
  } catch (err) {
    console.error('Password verification failed for user:', user.email, err);
  }
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Email not verified. Check your inbox.',
      code: 'email_unverified'
    });
  }
  if (user.two_factor_enabled) {
    if (!totpCode) {
      return res.status(400).json({ error: 'Two-factor code required.', twoFactorRequired: true });
    }
    if (!verifyTotpCode(user.two_factor_secret || '', totpCode)) {
      return res.status(400).json({ error: 'Invalid two-factor code.', twoFactorRequired: true });
    }
  }
  const role = isAdminEmail(user.email) ? 'admin' : user.role || 'user';
  const token = signToken({ id: user.id, email: user.email, plan: user.plan, role });
  
  // Create persistent session in MySQL
  await createSession(
    user.id,
    token,
    req.headers['user-agent'] || null,
    req.ip || req.headers['x-forwarded-for'] || 'unknown'
  );
  
  res.setHeader('Content-Type', 'application/json');
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name || null,
      plan: user.plan,
      role,
      emailVerified: Boolean(user.email_verified),
      aiRoleId: user.ai_role_id || null,
      twoFactorEnabled: Boolean(user.two_factor_enabled),
      apiCredits: user.api_credits
    }
  });
});

app.post('/api/calm', authMiddleware, async (req, res) => {
  const { messages, settings } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages required.' });
  }
  const lastMessage = messages[messages.length - 1];
  const lastContent = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  const crisisPattern =
      /suicide|kill myself|self-harm|self harm|end my life|want to die|kms|take my life/i;
  if (crisisPattern.test(lastContent)) {
    return res.json({ message: CALM_MODE_SUPPORT_MESSAGE });
  }
  try {
    const feature = await getFeatureModel('calm_mode');
    const systemPrompt =
        feature?.systemPrompt ||
        'You are Calm Mode, a warm and grounding assistant. Keep responses gentle, brief, and supportive. Encourage the user to reflect and take small next steps. Avoid giving medical or legal advice.';
    const modelMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    const start = Date.now();

    if (feature?.provider === 'llama') {
      const llamaConfig = await get('SELECT * FROM llama_settings WHERE id = 1');
      if (!llamaConfig || !llamaConfig.enabled || !llamaConfig.base_url) {
        return res.status(400).json({ error: 'Llama is not enabled or configured.' });
      }
      const featureModelId =
          feature?.modelId && feature.modelId !== 'llama' ? feature.modelId : llamaConfig.model_id;
      const selectedModelId = normalizeLlamaModelId(featureModelId);
      if (!selectedModelId) {
        return res.status(400).json({ error: 'Llama model ID is not configured.' });
      }
      const primaryInstance = {
        baseUrl: llamaConfig.base_url,
        modelId: selectedModelId,
        temperature: 0.7,
        maxTokens: 2048,
        topP: 0.9
      };
      try {
        const message = await callLlama(primaryInstance, modelMessages);
        const latencyMs = Date.now() - start;
        await run(
            'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'llama', primaryInstance.modelId, latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
        );
        return res.json({ message });
      } catch (error) {
        const clusterNode = await acquireClusterNode(selectedModelId);
        if (!clusterNode) throw error;
        const instance = {
          baseUrl: clusterNode.baseUrl,
          modelId: clusterNode.modelId || selectedModelId,
          temperature: 0.7,
          maxTokens: 2048,
          topP: 0.9
        };
        try {
          const message = await callLlama(instance, modelMessages);
          const latencyMs = Date.now() - start;
          await run(
              'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
              [req.user.id, 'llama', instance.modelId, latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
          );
          return res.json({ message });
        } finally {
          clusterNode.release();
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calm Mode failed.';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/auth/resend-verification', authRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  const user = await get(
      'SELECT id, email, email_verified, email_verification_sent_at FROM users WHERE email = ?',
      [email]
  );
  if (!user) return res.json({ ok: true });
  if (user.email_verified) return res.json({ ok: true });

  if (user.email_verification_sent_at) {
    const lastSent = new Date(user.email_verification_sent_at).getTime();
    if (Date.now() - lastSent < VERIFICATION_RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Please wait before requesting another email.' });
    }
  }

  const verificationToken = createVerificationToken();
  const verificationSentAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const verificationExpiresAt = buildVerificationExpiry();
  await run(
      `UPDATE users
      SET email_verification_token = ?, email_verification_sent_at = ?, email_verification_expires_at = ?
      WHERE id = ?`,
      [verificationToken, verificationSentAt, verificationExpiresAt, user.id]
  );

  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (error) {
    console.error('Verification email failed:', error);
  }

  return res.json({ ok: true });
});

app.get('/api/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing verification token.' });
  }
  const user = await get(
      'SELECT id, email_verification_expires_at, created_at, birthday_bonus_claimed, referred_by_id FROM users WHERE email_verification_token = ?',
      [token]
  );
  if (!user) return res.status(400).json({ error: 'Invalid or expired token.' });
  if (user.email_verification_expires_at) {
    const expiresAt = new Date(user.email_verification_expires_at).getTime();
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired token.' });
    }
  }

  // Zygiuos Birthday Promotion: Free $2 API for new users verified before June 5th, 23:59 Vilnius
  const PROMO_START = new Date('2026-05-21T00:00:00Z').getTime();
  const PROMO_END = new Date('2026-06-05T20:59:59Z').getTime(); // 23:59 Vilnius (EEST, UTC+3)
  const now = Date.now();
  const userCreatedAt = new Date(user.created_at).getTime();

  let birthdayBonusAwarded = false;
  if (now <= PROMO_END && userCreatedAt >= PROMO_START && !user.birthday_bonus_claimed) {
    birthdayBonusAwarded = true;
  }

  await run(
      `UPDATE users
      SET email_verified = 1,
          email_verification_token = NULL,
          email_verification_sent_at = NULL,
          email_verification_expires_at = NULL,
          api_credits = api_credits + ?,
          birthday_bonus_claimed = ?
      WHERE id = ?`,
      [birthdayBonusAwarded ? 2.00 : 0, birthdayBonusAwarded ? 1 : user.birthday_bonus_claimed, user.id]
  );

  // Referral Bonus: Award $2 to the referrer if within promo period
  if (birthdayBonusAwarded && user.referred_by_id) {
    await run(
      'UPDATE users SET api_credits = api_credits + 2.00 WHERE id = ?',
      [user.referred_by_id]
    );
  }

  return res.json({ ok: true, birthdayBonusAwarded });
});

const PASSWORD_RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;

const createPasswordResetToken = () => randomBytes(32).toString('hex');

app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  const normalizedEmail = normalizeEmail(email);
  const user = await get('SELECT id, email, email_verified FROM users WHERE email = ?', [normalizedEmail]);

  // Always return ok to prevent email enumeration
  if (!user) {
    return res.json({ ok: true });
  }

  const resetToken = createPasswordResetToken();
  const resetSentAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const resetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

  await run(
    `UPDATE users
     SET password_reset_token = ?, password_reset_sent_at = ?, password_reset_expires_at = ?
     WHERE id = ?`,
    [resetToken, resetSentAt, resetExpiresAt, user.id]
  );

  try {
    await sendPasswordResetEmail(user.email, resetToken);
  } catch (error) {
    console.error('Password reset email failed:', error);
  }

  return res.json({ ok: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  const passwordError = validatePassword(newPassword, { fieldName: 'New password' });
  if (passwordError) return res.status(400).json({ error: passwordError });

  const user = await get(
    'SELECT id, password_reset_expires_at FROM users WHERE password_reset_token = ?',
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token.' });
  }

  if (user.password_reset_expires_at) {
    const expiresAt = new Date(user.password_reset_expires_at).getTime();
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }
  }

  const newHash = await hashPassword(newPassword);
  await run(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_sent_at = NULL, password_reset_expires_at = NULL WHERE id = ?',
    [newHash, user.id]
  );

  // Revoke all existing sessions for security
  await revokeAllUserSessions(user.id, null);

  return res.json({ ok: true });
});

// --- API Routes ---
const apiRouter = express.Router();
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ user: req.user });
});

app.get('/api/keys', authMiddleware, async (req, res) => {
  try {
    const keys = await all('SELECT id, name, api_key, created_at, last_used_at, monthly_limit, current_monthly_spend, ip_allowlist FROM api_keys WHERE user_id = ?', [req.user.id]);
    const maskedKeys = keys.map(k => ({
      ...k,
      api_key: `${k.api_key.slice(0, 8)}...${k.api_key.slice(-4)}`
    }));
    res.json({ keys: maskedKeys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/api-usage', authMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const usage = await all(
      `SELECT DATE(created_at) as day, SUM(cost) as total_cost, COUNT(*) as total_requests, SUM(prompt_tokens + completion_tokens) as total_tokens
       FROM api_usage_logs 
       WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY day ORDER BY day ASC`,
      [req.user.id, parseInt(days)]
    );
    res.json({ usage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Notes API ---
app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const notes = await all(
      'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ notes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  const { content, reminder_at } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required.' });
  try {
    const id = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    await run(
      'INSERT INTO notes (id, user_id, content, reminder_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.user.id, content, reminder_at || null, now, now]
    );
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content, reminder_at, notified } = req.body;
  try {
    await run(
      'UPDATE notes SET content = COALESCE(?, content), reminder_at = COALESCE(?, reminder_at), notified = COALESCE(?, notified), updated_at = ? WHERE id = ? AND user_id = ?',
      [content, reminder_at, notified, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await run('DELETE FROM notes WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notes/reminders', authMiddleware, async (req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    const reminders = await all(
      'SELECT * FROM notes WHERE user_id = ? AND reminder_at IS NOT NULL AND reminder_at <= ? AND notified = 0',
      [req.user.id, now]
    );
    res.json({ reminders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Tasks API ---
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const tasks = await all(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
  const { title, due_at } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const id = randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    await run(
      'INSERT INTO tasks (id, user_id, title, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, title, 'pending', due_at || null, now, now]
    );
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, status, due_at } = req.body;
  try {
    await run(
      'UPDATE tasks SET title = COALESCE(?, title), status = COALESCE(?, status), due_at = COALESCE(?, due_at), updated_at = ? WHERE id = ? AND user_id = ?',
      [title, status, due_at, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Provider Health Checks ---
const checkProviderHealth = async () => {
  const providers = await all('SELECT id, name, base_url, provider_type FROM api_providers WHERE enabled = 1');
  
  for (const provider of providers) {
    if (!provider.base_url) continue;
    let isHealthy = 0;
    try {
      // Improve health check for local infrastructure
      let testUrl = provider.base_url;
      if (provider.base_url.includes('11234') || provider.base_url.includes('11434') || provider.base_url.includes(':808')) {
        testUrl = provider.base_url.endsWith('/v1') 
          ? `${provider.base_url}/models` 
          : `${provider.base_url}/v1/models`;
      }
      
      const response = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
      isHealthy = response.ok ? 1 : 0;
    } catch (e) {
      isHealthy = 0;
    }

    await run(
      'UPDATE api_providers SET is_healthy = ?, last_health_check = ? WHERE id = ?',
      [isHealthy, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), provider.id]
    );
    
    if (isHealthy === 0) {
      console.warn(`[Health Check] Provider ${provider.name} is UNHEALTHY (tried ${provider.base_url})`);
    }
  }
};

// Initial check and start interval
checkProviderHealth();
setInterval(checkProviderHealth, 60000); // Every minute

app.post('/api/keys', authMiddleware, async (req, res) => {
  try {
    const { name, monthlyLimit, ipAllowlist } = req.body;
    const keyId = createId();
    const apiKey = `zy-${randomBytes(24).toString('hex')}`;
    const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    
    await run(
      'INSERT INTO api_keys (id, user_id, api_key, name, monthly_limit, ip_allowlist, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [keyId, req.user.id, apiKey, name || 'Default Key', monthlyLimit || null, ipAllowlist || null, createdAt]
    );
    
    res.json({ 
      id: keyId,
      api_key: apiKey,
      name: name || 'Default Key',
      monthly_limit: monthlyLimit,
      ip_allowlist: ipAllowlist,
      created_at: createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/keys/:id', authMiddleware, async (req, res) => {
  try {
    const { name, monthlyLimit, ipAllowlist } = req.body;
    await run(
      'UPDATE api_keys SET name = ?, monthly_limit = ?, ip_allowlist = ? WHERE id = ? AND user_id = ?',
      [name, monthlyLimit || null, ipAllowlist || null, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/keys/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (token) {
    await revokeSessionByToken(token);
  }
  
  return res.json({ ok: true });
});

app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  // Revoke all sessions except current one
  const currentSession = await validateSession(token);
  await revokeAllUserSessions(req.user.id, currentSession?.id);
  
  return res.json({ ok: true });
});

app.get('/api/auth/sessions', authMiddleware, async (req, res) => {
  const sessions = await getUserSessions(req.user.id);
  return res.json({ sessions });
});

app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'Display name required.' });
  }
  
  // Check ban filters
  const banError = await checkBanFilters(displayName, 'keyword');
  if (banError) return res.status(400).json({ error: banError });
  
  await run(`UPDATE users SET display_name = ? WHERE id = ?`, [
    displayName.trim(),
    req.user.id
  ]);
  const updated = await get(
      'SELECT id, email, display_name, plan, role, email_verified, ai_role_id, two_factor_enabled FROM users WHERE id = ?',
      [req.user.id]
  );
  return res.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.display_name || null,
      plan: updated.plan,
      role: updated.role,
      emailVerified: Boolean(updated.email_verified),
      aiRoleId: updated.ai_role_id || null,
      twoFactorEnabled: Boolean(updated.two_factor_enabled)
    }
  });
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword, totpCode } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required.' });
  }
  const currentPasswordError = validatePassword(currentPassword, {
    minLength: 1,
    fieldName: 'Current password'
  });
  if (currentPasswordError) return res.status(400).json({ error: currentPasswordError });
  const newPasswordError = validatePassword(newPassword, { fieldName: 'New password' });
  if (newPasswordError) return res.status(400).json({ error: newPasswordError });
  const userRow = await get(
      'SELECT password_hash, two_factor_enabled, two_factor_secret FROM users WHERE id = ?',
      [req.user.id]
  );
  if (!userRow?.password_hash) {
    return res.status(400).json({ error: 'Password reset required.' });
  }
  const valid = await verifyPassword(currentPassword, userRow.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (userRow.two_factor_enabled) {
    if (!totpCode) {
      return res.status(400).json({ error: 'Two-factor code required to change password.' });
    }
    if (!verifyTotpCode(userRow.two_factor_secret || '', totpCode)) {
      return res.status(400).json({ error: 'Invalid two-factor code.' });
    }
  }
  const newHash = await hashPassword(newPassword);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
  
  // Revoke all other sessions after password change for security
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const currentSession = await validateSession(token);
  await revokeAllUserSessions(req.user.id, currentSession?.id);
  
  return res.json({ ok: true });
});

app.get('/api/auth/2fa/setup', authMiddleware, async (req, res) => {
  const secret = generateTotpSecret();
  await run('UPDATE users SET two_factor_pending_secret = ? WHERE id = ?', [secret, req.user.id]);
  const otpauthUrl = buildOtpAuthUrl(req.user.email, secret);
  return res.json({
    twoFactorEnabled: req.user.twoFactorEnabled,
    secret,
    otpauthUrl
  });
});

app.post('/api/auth/2fa/enable', authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Verification code required.' });
  }
  const userRow = await get(
      'SELECT two_factor_pending_secret FROM users WHERE id = ?',
      [req.user.id]
  );
  const pending = userRow?.two_factor_pending_secret;
  if (!pending) {
    return res.status(400).json({ error: 'No pending two-factor setup found.' });
  }
  if (!verifyTotpCode(pending, code)) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }
  await run(
      'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_pending_secret = NULL WHERE id = ?',
      [pending, req.user.id]
  );
  
  // Revoke all other sessions after enabling 2FA
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const currentSession = await validateSession(token);
  await revokeAllUserSessions(req.user.id, currentSession?.id);
  
  return res.json({ ok: true, twoFactorEnabled: true });
});

app.post('/api/auth/2fa/disable', authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Verification code required.' });
  }
  const userRow = await get(
      'SELECT two_factor_secret FROM users WHERE id = ?',
      [req.user.id]
  );
  const secret = userRow?.two_factor_secret;
  if (!secret) {
    return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
  }
  if (!verifyTotpCode(secret, code)) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }
  await run(
      'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_pending_secret = NULL WHERE id = ?',
      [req.user.id]
  );
  
  // Revoke all other sessions after disabling 2FA
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const currentSession = await validateSession(token);
  await revokeAllUserSessions(req.user.id, currentSession?.id);
  
  return res.json({ ok: true, twoFactorEnabled: false });
});

app.post('/api/billing/upgrade', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  const normalizedPlan = plan === 'paid' || plan === 'ad' ? plan : 'free';
  await run('UPDATE users SET plan = ? WHERE id = ?', [normalizedPlan, req.user.id]);
  const user = { ...req.user, plan: normalizedPlan };
  const token = signToken(user);
  return res.json({ token, user });
});

app.get('/api/admin/users', authMiddleware, async (req, res) => {
  const users = await all(
      'SELECT id, email, plan, role, ai_role_id, email_verified, banned_from_marketplace, created_at, grace_plan, grace_plan_expires_at FROM users ORDER BY created_at DESC'
  );
  res.json({ users });
});

const VALID_PLANS = ['free', 'go', 'plus', 'beta', 'paid', 'ad'];

app.patch('/api/admin/users/:id', authMiddleware, async (req, res) => {
  const { plan, role, aiRoleId } = req.body;
  const normalizedPlan = VALID_PLANS.includes(plan) ? plan : 'free';
  const normalizedRole = role === 'admin' ? 'admin' : 'user';
  await run('UPDATE users SET plan = ?, role = ?, ai_role_id = ? WHERE id = ?', [
    normalizedPlan,
    normalizedRole,
    aiRoleId || null,
    req.params.id
  ]);
  res.json({ ok: true });
});

app.patch('/api/admin/users/:id/marketplace-ban', authMiddleware, async (req, res) => {
  const { banned } = req.body;
  await run('UPDATE users SET banned_from_marketplace = ? WHERE id = ?', [banned ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

// Grace period — admin grants temporary plan upgrade
// Body: { plan: 'go'|'plus'|'beta', days: number|null }
// days=null means forever; days=0 revokes any active grace period
app.post('/api/admin/users/:id/grace', authMiddleware, adminMiddleware, async (req, res) => {
  const { plan, days } = req.body;
  const VALID_GRACE_PLANS = ['go', 'plus', 'beta'];

  // Revoke
  if (days === 0 || plan === 'free' || plan === null) {
    await run('UPDATE users SET grace_plan = NULL, grace_plan_expires_at = NULL WHERE id = ?', [req.params.id]);
    return res.json({ ok: true, revoked: true });
  }

  if (!VALID_GRACE_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be go, plus, or beta.' });
  }

  let expiresAt = null;
  if (days != null && Number.isFinite(Number(days)) && Number(days) > 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days));
    expiresAt = d.toISOString();
  }

  await run(
    'UPDATE users SET grace_plan = ?, grace_plan_expires_at = ? WHERE id = ?',
    [plan, expiresAt, req.params.id]
  );
  res.json({ ok: true, plan, expiresAt });
});

apiRouter.get('/admin/ban-filters', authMiddleware, async (req, res) => {
  const filters = await all(
    `SELECT id, filter_type, filter_value, is_regex, description, active, created_at, updated_at 
     FROM ban_filters ORDER BY filter_type, created_at DESC`
  );
  res.json({ filters });
});

apiRouter.post('/admin/ban-filters', authMiddleware, async (req, res) => {
  const { filterType, filterValue, isRegex, description } = req.body;
  
  if (!filterType || !['keyword', 'domain_pattern', 'email_pattern'].includes(filterType)) {
    return res.status(400).json({ error: 'Valid filter_type required (keyword, domain_pattern, email_pattern).' });
  }
  if (!filterValue || typeof filterValue !== 'string') {
    return res.status(400).json({ error: 'Filter value required.' });
  }
  
  // Validate regex if provided
  if (isRegex) {
    try {
      new RegExp(filterValue);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid regex pattern.' });
    }
  }
  
  try {
    await run(
      `INSERT INTO ban_filters (filter_type, filter_value, is_regex, description, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [filterType, filterValue, isRegex ? 1 : 0, description || null, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
    );
    res.json({ ok: true, message: 'Filter added successfully.' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('uk_ban_filters_value')) {
      return res.status(409).json({ error: 'This filter already exists.' });
    }
    res.status(500).json({ error: 'Failed to add filter.' });
  }
});

apiRouter.patch('/admin/ban-filters/:id', authMiddleware, async (req, res) => {
  const { active, description } = req.body;
  
  if (typeof active === 'boolean' || description) {
    const updates = [];
    const params = [];
    
    if (typeof active === 'boolean') {
      updates.push('active = ?');
      params.push(active ? 1 : 0);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '));
    params.push(req.params.id);
    
    await run(`UPDATE ban_filters SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  
  res.json({ ok: true });
});

apiRouter.delete('/admin/ban-filters/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM ban_filters WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// User ban management
app.patch('/api/admin/users/:id/ban', authMiddleware, async (req, res) => {
  const { isBanned, banReason, banExpiresAt } = req.body;
  
  await run(
    'UPDATE users SET is_banned = ?, ban_reason = ?, ban_expires_at = ? WHERE id = ?',
    [isBanned ? 1 : 0, banReason || null, banExpiresAt || null, req.params.id]
  );
  
  if (isBanned) {
    await run(
      'INSERT INTO ban_logs (user_id, reason, triggered_by, admin_id, permanent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, banReason || 'Manual ban', 'admin', req.user.id, banExpiresAt ? 0 : 1, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
    );
  }
  
  res.json({ ok: true });
});

app.get('/api/admin/ban-logs', authMiddleware, async (req, res) => {
  const logs = await all(
    `SELECT bl.id, bl.user_id, u.email, bl.reason, bl.triggered_by, bl.permanent, bl.created_at
     FROM ban_logs bl
     LEFT JOIN users u ON bl.user_id = u.id
     ORDER BY bl.created_at DESC
     LIMIT 100`
  );
  res.json({ logs });
});

app.post('/api/admin/users/:id/reset-password', authMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'newPassword required.' });
  const passwordHash = await hashPassword(newPassword);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/test-email', authMiddleware, async (req, res) => {
  const { email } = req.body || {};
  const target = email || req.user?.email;
  if (!target) return res.status(400).json({ error: 'Email required.' });
  try {
    const result = await sendEmail({
      to: target,
      subject: 'ZygAI test email',
      text: 'This is a test email from your ZygAI admin console.',
      html: '<p>This is a test email from your ZygAI admin console.</p>'
    });
    if (!result.sent) {
      return res.status(500).json({ error: 'Email not configured on server.' });
    }
    return res.json({
      ok: true,
      messageId: result.info?.messageId || null,
      response: result.info?.response || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email send failed.';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/admin/email-config', authMiddleware, adminMiddleware, (req, res) => {
  const redacted = (value) => (value ? 'set' : 'missing');
  res.json({
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: process.env.SMTP_PORT || null,
    smtpSecure: process.env.SMTP_SECURE || null,
    smtpUser: redacted(process.env.SMTP_USER),
    smtpPass: redacted(process.env.SMTP_PASS),
    emailFrom: process.env.EMAIL_FROM || null,
    appBaseUrl: process.env.APP_BASE_URL || null
  });
});

const buildHealthPayload = async () => {
  let mainServerOk = false;
  let mainServerStatus = 'not configured';
  const llamaConfig = await get('SELECT base_url, enabled FROM llama_settings WHERE id = 1');
  if (llamaConfig?.enabled && llamaConfig?.base_url) {
    try {
      const response = await fetchWithTimeout(
          llamaConfig.base_url.replace(/\/$/, '') + '/v1/models',
          3000
      );
      mainServerOk = response.ok;
      mainServerStatus = response.ok ? 'ok' : `http ${response.status}`;
    } catch (error) {
      mainServerStatus = error instanceof Error ? error.message : 'fetch failed';
    }
   }

   let exaOk = false;
   let exaStatus = 'not configured';
   if (EXA_API_KEY) {
     try {
       const response = await fetch('https://api.exa.ai/search', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${EXA_API_KEY}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           query: 'test',
           type: 'neural',
           numResults: 1
         })
       });
       exaOk = response.ok;
       exaStatus = response.ok ? 'ok' : `http ${response.status}`;
     } catch (error) {
       exaStatus = error instanceof Error ? error.message : 'fetch failed';
     }
   }

  const nodes = await all(
      'SELECT id, name, base_url, display_name, model_id, enabled FROM ollama_cluster_nodes ORDER BY priority ASC'
  );
  const clusterNodes = await Promise.all(
      nodes.map(async (node) => ({
        id: node.id,
        name: node.name || '',
        baseUrl: node.base_url,
        displayName: node.display_name || '',
        modelId: node.model_id || '',
        enabled: node.enabled === 1,
        ok: await checkClusterHealth(node.base_url)
      }))
  );

  const mcpServers = await loadApiToolServers();
  const enabledApiServers = mcpServers.filter((server) => server.enabled);
  const apiToolHealthStatus = await Promise.all(
      enabledApiServers.map(async (server) => {
        const health = await checkApiToolHealth(server);
        return {
          id: server.id,
          name: server.name || '',
          baseUrl: server.baseUrl,
          status: health.status,
          mcpJsonUrl: server.mcpJsonUrl || null,
          mcpJsonStatus: health.mcpJsonStatus || 'not_configured'
        };
      })
  );

  return {
     mainServer: {
       baseUrl: llamaConfig?.base_url || null,
       ok: mainServerOk,
       status: mainServerStatus
     },
     exa: {
       configured: !!EXA_API_KEY,
       ok: exaOk,
       status: exaStatus
     },
     clusterNodes,
     mcpServers: apiToolHealthStatus
  };
};

app.get('/api/health', async (req, res) => {
  const payload = await buildHealthPayload();
  res.json(payload);
});

app.post('/api/health', optionalAuthMiddleware, async (req, res) => {
  const payload = await buildHealthPayload();
  res.json(payload);
});

app.get('/api/blog/:slug', async (req, res) => {
  const slug = req.params.slug?.trim();
  if (!slug) return res.status(400).json({ error: 'Missing slug.' });
  const post = await get(
      `SELECT id, slug, title, content, meta_title, meta_description, meta_image, created_at, updated_at
     FROM blog_posts
     WHERE slug = ? AND published = 1`,
      [slug]
  );
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ post });
});

app.get('/api/blog', async (req, res) => {
  const posts = await all(
      `SELECT id, slug, title, meta_description, created_at, updated_at
     FROM blog_posts
     WHERE published = 1
     ORDER BY created_at DESC`
  );
  res.json({ posts });
});

app.get('/api/admin/blog', authMiddleware, async (req, res) => {
  const posts = await all(
      `SELECT id, slug, title, content, meta_title, meta_description, meta_image, published, created_at, updated_at
     FROM blog_posts
     ORDER BY created_at DESC`
  );
  res.json({ posts });
});

app.post('/api/admin/blog', authMiddleware, async (req, res) => {
  const { title, slug, content, published, metaTitle, metaDescription, metaImage } = req.body || {};
  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();
  if (!trimmedTitle) return res.status(400).json({ error: 'Title required.' });
  if (!trimmedContent) return res.status(400).json({ error: 'Content required.' });
  const resolvedSlug = slugify(slug || trimmedTitle);
  if (!resolvedSlug) return res.status(400).json({ error: 'Slug required.' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  try {
    const result = await run(
        `INSERT INTO blog_posts (slug, title, content, meta_title, meta_description, meta_image, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedSlug,
          trimmedTitle,
          trimmedContent,
          metaTitle?.trim() || null,
          metaDescription?.trim() || null,
          metaImage?.trim() || null,
          published ? 1 : 0,
          now,
          now
        ]
    );
     return res.json({ id: result.insertId, slug: resolvedSlug });
  } catch (error) {
    const message =
        error?.message?.includes('UNIQUE') || error?.message?.includes('unique')
            ? 'Slug already exists.'
            : 'Failed to create post.';
    return res.status(400).json({ error: message });
  }
});

app.put('/api/admin/blog/:id', authMiddleware, async (req, res) => {
  const { title, slug, content, published, metaTitle, metaDescription, metaImage } = req.body || {};
  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();
  if (!trimmedTitle) return res.status(400).json({ error: 'Title required.' });
  if (!trimmedContent) return res.status(400).json({ error: 'Content required.' });
  const resolvedSlug = slugify(slug || trimmedTitle);
  if (!resolvedSlug) return res.status(400).json({ error: 'Slug required.' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  try {
    await run(
        `UPDATE blog_posts
       SET slug = ?, title = ?, content = ?, meta_title = ?, meta_description = ?, meta_image = ?, published = ?, updated_at = ?
       WHERE id = ?`,
        [
          resolvedSlug,
          trimmedTitle,
          trimmedContent,
          metaTitle?.trim() || null,
          metaDescription?.trim() || null,
          metaImage?.trim() || null,
          published ? 1 : 0,
          now,
          req.params.id
        ]
    );
    return res.json({ ok: true, slug: resolvedSlug });
  } catch (error) {
    const message =
        error?.message?.includes('UNIQUE') || error?.message?.includes('unique')
            ? 'Slug already exists.'
            : 'Failed to update post.';
    return res.status(400).json({ error: message });
  }
});

app.delete('/api/admin/blog/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
  return res.json({ ok: true });
});

// Announcement endpoints
app.get('/api/announcement', async (req, res) => {
  const row = await get('SELECT message FROM announcements ORDER BY id DESC LIMIT 1');
  if (!row) return res.json({ message: '' });
  return res.json({ message: row.message });
});

app.get('/api/admin/announcement', authMiddleware, async (req, res) => {
  const row = await get('SELECT message FROM announcements ORDER BY id DESC LIMIT 1');
  if (!row) return res.json({ message: '' });
  return res.json({ message: row.message });
});

app.post('/api/admin/announcement', authMiddleware, async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message required.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  // Upsert: delete old and insert new (single-row table pattern)
  await run('DELETE FROM announcements');
  const result = await run(
    'INSERT INTO announcements (message, created_at, updated_at) VALUES (?, ?, ?)',
    [message.trim(), now, now]
  );
  return res.json({ ok: true, id: result.insertId });
});


// === CHANGELOG ENDPOINTS ===

app.get('/api/changelogs', async (req, res) => {
  try {
    const changelogs = await all(
      'SELECT id, version, content, created_at FROM changelogs WHERE published = 1 ORDER BY id DESC LIMIT 10'
    );
    res.json({ changelogs: changelogs || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch changelogs.' });
  }
});

app.get('/api/admin/changelogs', authMiddleware, async (req, res) => {
  try {
    const changelogs = await all(
      'SELECT id, version, content, published, created_at, updated_at FROM changelogs ORDER BY id DESC'
    );
    res.json({ changelogs: changelogs || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch changelogs.' });
  }
});

app.post('/api/admin/changelogs', authMiddleware, async (req, res) => {
  const { version, content, published } = req.body || {};
  if (!version || !content) return res.status(400).json({ error: 'Version and content required.' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  try {
    const result = await run(
      'INSERT INTO changelogs (version, content, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [version.trim(), content.trim(), published ? 1 : 0, now, now]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create changelog.' });
  }
});

app.put('/api/admin/changelogs/:id', authMiddleware, async (req, res) => {
  const { version, content, published } = req.body || {};
  if (!version || !content) return res.status(400).json({ error: 'Version and content required.' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  try {
    await run(
      'UPDATE changelogs SET version = ?, content = ?, published = ?, updated_at = ? WHERE id = ?',
      [version.trim(), content.trim(), published ? 1 : 0, now, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update changelog.' });
  }
});

app.delete('/api/admin/changelogs/:id', authMiddleware, async (req, res) => {
  try {
    await run('DELETE FROM changelogs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete changelog.' });
  }
});

app.post(
    '/api/admin/users/:id/send-verification',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
      const user = await get('SELECT id, email, email_verified FROM users WHERE id = ?', [
        req.params.id
      ]);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (user.email_verified) return res.json({ ok: true });

      const verificationToken = createVerificationToken();
      const verificationSentAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
      const verificationExpiresAt = buildVerificationExpiry();
      await run(
          `UPDATE users
        SET email_verification_token = ?, email_verification_sent_at = ?, email_verification_expires_at = ?
        WHERE id = ?`,
          [verificationToken, verificationSentAt, verificationExpiresAt, user.id]
      );

      try {
        await sendVerificationEmail(user.email, verificationToken);
      } catch (error) {
        console.error('Verification email failed:', error);
      }

      return res.json({ ok: true });
    }
);

app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  const totalUsersRow = await get('SELECT COUNT(*) as count FROM users');
  const paidUsersRow = await get("SELECT COUNT(*) as count FROM users WHERE plan = 'paid'");
  const usageRows = await all(
      `SELECT SUBSTRING(created_at, 1, 10) as day, COUNT(*) as count
       FROM usage_logs GROUP BY day ORDER BY day DESC LIMIT 14`
  );
  const alSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const alUsageRow = await get(
      `SELECT COUNT(*) as count
     FROM usage_logs
     WHERE model IN ('groq-al-campaign', 'qwen/qwen3-32b')
       AND created_at >= ?`,
      [alSince]
  );
  const totalUsers = totalUsersRow?.count ?? 0;
  const paidUsers = paidUsersRow?.count ?? 0;
  const usageByDay = usageRows.reverse();
  const alUsage30d = alUsageRow?.count ?? 0;
  const onlineCount = getOnlineCount();
  const installTotalRow = await get('SELECT COUNT(*) as count FROM pwa_installs');
  const install30dRow = await get(
      `SELECT COUNT(*) as count
     FROM pwa_installs
     WHERE created_at >= ?`,
      [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()]
  );
  let stripeStats = null;
  if (stripe) {
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
      stripe.subscriptions.list({ status: 'trialing', limit: 100 })
    ]);
    stripeStats = {
      activeSubscriptions: activeSubs.data.length,
      trialingSubscriptions: trialingSubs.data.length
    };
  }
  res.json({
    totalUsers,
    paidUsers,
    usageByDay,
    onlineUsers: onlineCount,
    stripeStats,
    alUsage30d,
    pwaInstalls: installTotalRow?.count ?? 0,
    pwaInstalls30d: install30dRow?.count ?? 0
  });
});

app.get('/api/admin/logs', authMiddleware, async (req, res) => {
  const logs = await all(
      `SELECT usage_logs.id, usage_logs.user_id, users.email, usage_logs.provider, usage_logs.model, usage_logs.latency_ms, usage_logs.created_at
       FROM usage_logs LEFT JOIN users ON usage_logs.user_id = users.id
       ORDER BY usage_logs.created_at DESC LIMIT 200`
  );
  res.json({ logs });
});

app.post('/api/admin/bulk-email', authMiddleware, async (req, res) => {
  const { subject, text, html, userIds } = req.body || {};
  if (!subject?.trim()) return res.status(400).json({ error: 'Subject required.' });
  if (!text?.trim()) return res.status(400).json({ error: 'Message required.' });
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'No recipients selected.' });
  }
  const placeholders = userIds.map(() => '?').join(', ');
  const recipients = await all(
      `SELECT id, email FROM users WHERE id IN (${placeholders})`,
      userIds
  );
  if (!recipients.length) {
    return res.status(400).json({ error: 'No matching users found.' });
  }
  const results = await Promise.allSettled(
      recipients.map((user) =>
          sendEmail({
            to: user.email,
            subject: subject.trim(),
            text: text.trim(),
            html: html?.trim() || undefined
          })
      )
  );
  const failed = results
      .map((result, index) => ({ result, user: recipients[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ user, result }) => ({
        id: user.id,
        email: user.email,
        error: result.status === 'rejected' ? result.reason?.message || 'Send failed.' : ''
      }));
  return res.json({
    ok: true,
    sent: recipients.length - failed.length,
    failed
  });
});



const callAI = async (providerName, modelId, messages, customSystemPrompt) => {
  if (providerName === 'llama') {
    const llamaConfig = await get('SELECT * FROM llama_settings WHERE id = 1');
    if (!llamaConfig || !llamaConfig.enabled || !llamaConfig.base_url) {
      throw new Error('Llama is not enabled or configured.');
    }
    const selectedModelId = normalizeLlamaModelId(modelId || llamaConfig.model_id);
    const instance = {
      baseUrl: llamaConfig.base_url,
      modelId: selectedModelId,
      temperature: 0.7,
      maxTokens: 2048,
      topP: 0.9
    };
    try {
      return await callLlama(instance, messages, customSystemPrompt);
    } catch (err) {
      const clusterNode = await acquireClusterNode(selectedModelId);
      if (!clusterNode) throw err;
      try {
        return await callLlama({ ...instance, baseUrl: clusterNode.baseUrl, modelId: clusterNode.modelId || selectedModelId }, messages, customSystemPrompt);
      } finally {
        clusterNode.release();
      }
    }
  }

  // Resolve model config for non-Llama providers (handle m- prefixed IDs)
  let resolvedModelId = modelId;
  let resolvedProvider = providerName;

  if (modelId && typeof modelId === 'string') {
    const config = await get(
      `SELECT mc.model_id, ap.name as provider_name
       FROM model_configs mc
       LEFT JOIN api_providers ap ON mc.provider_id = ap.id
       WHERE mc.id = ? AND mc.enabled = 1`,
      [modelId]
    );

    if (config) {
      resolvedModelId = config.model_id;
      resolvedProvider = (config.provider_name || providerName).toLowerCase();
    } else if (modelId.startsWith('m-')) {
      // Model ID references a model_config that doesn't exist or is disabled
      throw new Error(`${modelId} is not a valid model ID`);
    }
  }

  // Check if there's a registered handler first
  const providerHandler = getProviderHandler(resolvedProvider.toLowerCase());
  
  // Handle other providers via api_providers table if needed
  const providerRow = await get('SELECT * FROM api_providers WHERE LOWER(name) = ? AND enabled = 1', [resolvedProvider.toLowerCase()]);
  
  if (providerHandler) {
    return providerHandler({ providerRow: providerRow || { provider_type: resolvedProvider }, modelId: resolvedModelId, messages, customSystemPrompt });
  }

  if (!providerRow) {
    throw new Error(`Provider ${resolvedProvider} not found or disabled.`);
  }

  let baseUrl = providerRow.base_url || 'https://api.openai.com/v1';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerRow.api_key}`
  };

  // Normalize messages array
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  
  // GLOBAL SYSTEM RULES - ALWAYS APPLIED
  const SYSTEM_RULE = "RULE: WHEN CREATING HTML, CSS OR JAVASCRIPT CODE: ALWAYS put ALL code in ONE SINGLE ```html CODE BLOCK. DO NOT split into separate HTML, CSS, JS blocks. DO NOT write explanations, notes, or text around the code block. Include all styles, scripts and markup inside this single HTML file. Always create complete self-contained working code. FILENAME RULES: When generating separate files, use ONLY these filenames: `index.html`, `styles.css`, and `index.js` (never use index.css or index.javascript).";
  
  const finalSystemPrompt = customSystemPrompt 
    ? `${customSystemPrompt}\n\n${SYSTEM_RULE}` 
    : SYSTEM_RULE;

  const payload = {
    model: resolvedModelId,
    messages: [{ role: 'system', content: finalSystemPrompt }, ...normalizedMessages],
    temperature: 0.7
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `AI request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return content;
};



 app.post('/api/chat', authMiddleware, async (req, res) => {
   let { provider, model, messages, settings, zygId, sessionId, selectedApiTools = [], feature = 'chat' } = req.body;

   try {
       // Resolve model config
       const resolved = await resolveModelConfig(model);
       const modelConfig = resolved;
       if (resolved) {
         model = resolved.modelId;
         provider = resolved.provider.type || resolved.provider.name.toLowerCase();
         
         // Check role access
         if (resolved.role === 'admin' && req.user.role !== 'admin') {
           return res.status(403).json({ error: 'Access denied to this model.' });
         }

         // Check plan access
         const userPlan = req.user.plan || 'free';
         const planAccess = parsePlanAccess(resolved.planAccess);
         if (!planAccess.includes(userPlan)) {
           return res.status(403).json({ error: `Your ${PLAN_LABELS[userPlan] || userPlan} plan cannot access this model.` });
         }

         // Check usage quota
         const quotaRes = await enforcePlanQuota(req.user, feature);
         if (!quotaRes.ok) {
           return res.status(429).json(buildPlanQuotaError(quotaRes));
         }
       } else if (model && model.startsWith('m-')) {
         return res.status(400).json({ error: 'Model configuration not found.' });
       }

     if (!provider || !model || !messages) {
       return res.status(400).json({ error: 'Missing provider, model, or messages.' });
     }

     // For non-model-config requests, check quota
     const quotaRes = await enforcePlanQuota(req.user, feature);
     if (!quotaRes.ok) {
       return res.status(429).json(buildPlanQuotaError(quotaRes));
     }

       // Normalize messages: extract images from content array to userImages
      const normalizedMessages = messages.map(msg => {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter(block => block.type === 'text').map(block => block.text).join(' ');
          const imageBlocks = msg.content.filter(block => block.type === 'image');
          const userImages = imageBlocks.map(block => `data:${block.source.media_type};base64,${block.source.data}`);
          return {
            ...msg,
            content: textBlocks,
            userImages: userImages.length > 0 ? userImages : undefined
          };
        }
        return msg;
      });

      // Check if any message contains userImages
      const hasUserImages = normalizedMessages.some(msg => msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0);

      // Removed vision model check - allow any model to receive images
      // Users can choose which model to use for images

    const planSettings = await loadPlanSettings();
    const adPlanEnabled = planSettings.find((plan) => plan.id === 'ad')?.enabled !== false;
    const useCodeInterpreter = req.body.useCodeInterpreter === true;

    let effectiveProvider = provider;
    let effectiveModel = model;
    let roleSystemPrompt = '';

    // Redirect zygai provider to OpenRouter meta-llama/llama-3-8b-instruct
    if (effectiveProvider === 'zygai') {
      effectiveProvider = 'openrouter';
      effectiveModel = 'meta-llama/llama-3-8b-instruct';
    }

    // Check per-model daily limit
    const modelLimitCheck = await checkModelLimit(req.user.id, req.user.plan || 'free', effectiveModel);
    if (!modelLimitCheck.allowed) {
      return res.status(429).json({
        error: `Daily limit reached for this model. You have used ${modelLimitCheck.used}/${modelLimitCheck.limit} messages today.`,
        code: 'model_limit_exceeded',
        used: modelLimitCheck.used,
        limit: modelLimitCheck.limit
      });
    }
    if (req.user?.aiRoleId) {
      const role = await get(
          'SELECT provider, model_id, system_prompt, enabled FROM ai_roles WHERE id = ?',
          [req.user.aiRoleId]
      );
      if (role && role.enabled === 1) {
        effectiveProvider = role.provider;
        effectiveModel = role.model_id;
        roleSystemPrompt = role.system_prompt || '';
      }
    }

    // Zyg's own model takes precedence over user-selected model (but not AI Role)
    const activeZygForModel = zygId ? await getActiveZyg(req.user.id, zygId) : { prompt: '', knowledgeId: null, modelId: null, provider: null };
    if (activeZygForModel.modelId) {
      effectiveModel = activeZygForModel.modelId;
    }
    if (activeZygForModel.provider) {
      effectiveProvider = activeZygForModel.provider;
    }

    const hasAdAccess = req.user?.plan === 'ad' && adPlanEnabled;
    if (effectiveProvider === 'groq' && req.user?.plan !== 'paid' && !hasAdAccess) {
      return res.status(403).json({ error: 'Upgrade required for advanced models.' });
    }

    // CogniVision: Pre-analyze images using AI (if any)
    // Collect all cognivision image IDs
    const cogniVisionIds = new Set();
    normalizedMessages.forEach(msg => {
      if (msg.role === 'user' && Array.isArray(msg.userImages)) {
        msg.userImages.forEach(img => {
          if (img.startsWith('cognivision://')) {
            cogniVisionIds.add(img.replace('cognivision://', ''));
          }
        });
      }
    });

    // Perform analysis for missing ones
    if (cogniVisionIds.size > 0) {
      await Promise.all(Array.from(cogniVisionIds).map(async (id) => {
        const temp = tempImages.get(id);
        if (!temp || temp.userId !== req.user.id) return; // not found or unauthorized
        if (temp.analysis) return; // already analyzed

        try {
          // Build analysis request - ALWAYS use a vision-capable model for analysis
          const baseUrl = providerRow?.base_url || 'https://api.openai.com/v1';
          const apiKey = providerRow?.api_key;
          if (!apiKey) throw new Error('No API key for provider');

          const analysisPrompt = `Analyze this image and provide a JSON response with:
{
  "description": "concise description",
  "objects": ["detected objects"],
  "text": "OCR text if any",
  "scene": "scene category",
  "colors": ["dominant colors"],
  "emotions": ["detected emotions"]
}
Only output valid JSON.`;

          // Use a vision-capable model for analysis
          const visionModel = 'gpt-4o';

          let apiUrl, headers, payload;

          if (effectiveProvider === 'openai' || effectiveProvider === 'openrouter' || effectiveProvider === 'groq') {
            apiUrl = baseUrl.replace(/\/$/, '') + '/chat/completions';
            headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            };
            payload = {
              model: visionModel,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: analysisPrompt },
                    { type: 'image_url', image_url: { url: temp.data } }
                  ]
                }
              ],
              temperature: 0.3,
              max_tokens: 500
            };
          } else if (effectiveProvider === 'anthropic') {
            apiUrl = baseUrl.replace(/\/$/, '') + '/messages';
            headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'anthropic-version': '2023-06-01'
            };
            const base64 = temp.data.split(',')[1];
            const mimeMatch = temp.data.match(/^data:([^;]+);/);
            const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            payload = {
              model: effectiveModel,
              max_tokens: 500,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: analysisPrompt },
                    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
                  ]
                }
              ]
            };
          } else {
            // Provider not supported for analysis, skip
            return;
          }

          const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
          if (!response.ok) {
            throw new Error(`Analysis API error: ${response.status}`);
          }
          const data = await response.json();
          let content;
          if (effectiveProvider === 'anthropic') {
            content = data.content?.[0]?.text || '';
          } else {
            content = data.choices?.[0]?.message?.content || '';
          }

          // Parse JSON from content
          let analysis = null;
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // ignore parse errors
          }
          if (analysis) {
            tempImages.set(id, { ...temp, analysis });
          }
        } catch (err) {
          console.error('Image analysis failed:', err);
          // analysis not stored, LLM will see image directly
        }
      }));
    }

    // Process images for multimodal models
    // Helper to format analysis object as readable text
    const formatAnalysis = (a) => {
      const parts = [];
      if (a.description) parts.push(`Description: ${a.description}`);
      if (a.objects?.length) parts.push(`Objects: ${a.objects.join(', ')}`);
      if (a.text) parts.push(`Text: "${a.text}"`);
      if (a.scene) parts.push(`Scene: ${a.scene}`);
      if (a.colors?.length) parts.push(`Colors: ${a.colors.join(', ')}`);
      if (a.emotions?.length) parts.push(`Emotions: ${a.emotions.join(', ')}`);
      return parts.join('\n');
    };

     const processedMessages = normalizedMessages.map((msg) => {
       if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
         const { userImages, ...restOfMsg } = msg;
         const base64Images = userImages.map((imgData) => resolveImageToBase64(imgData, req.user.id)).filter(Boolean);
         let textContent = msg.content || 'Describe this image in detail.';

         // Prepend CogniVision analysis for images that have it
         const analysisTexts = userImages
           .map((img, idx) => ({ img, idx }))
           .filter(({ img }) => img.startsWith('cognivision://'))
           .map(({ img, idx }) => {
             const id = img.replace('cognivision://', '');
             const temp = tempImages.get(id);
             if (!temp || temp.userId !== req.user.id) return null;
             return temp?.analysis ? `[Image ${idx + 1}]\n${formatAnalysis(temp.analysis)}` : null;
           })
           .filter(Boolean);

         if (analysisTexts.length > 0) {
           textContent = `[Vision analysis]\n\n${analysisTexts.join('\n\n')}\n\nUser message:\n${textContent}`;
         }

         // Check if this is going to Ollama provider - use Ollama format
         if (effectiveProvider === 'llama') {
           // Ollama expects images array at message level with base64 strings
           return {
             ...restOfMsg,
             content: textContent,
             images: base64Images
           };
         } else {
           // OpenAI-style API format - content array with text and image_url objects
           const contentArray = [
             { type: 'text', text: textContent },
             ...base64Images.map((imgBase64) => ({
               type: 'image_url',
               image_url: { url: `data:image/jpeg;base64,${imgBase64}` }
             })),
           ];

           return { ...restOfMsg, content: contentArray };
         }
       }
       return msg;
     });

      // Build combined system prompt from model config + user settings + AI role
      const companyName = process.env.COMPANY_NAME || 'ZygAI';
      const modelSystemPrompt = modelConfig?.system_prompt
        ? String(modelConfig.system_prompt).replace(/\{model\}/g, effectiveModel || model).replace(/\{company\}/g, companyName)
        : '';
      const userCustomPrompt = settings?.systemPrompt || '';

      // Perform Context RAG Search to inject background knowledge
      const lastUserMsg = normalizedMessages.filter(m => m.role === 'user').pop();
      let globalContext = '';
      let ragSources = [];
      const activeZyg = await getActiveZyg(req.user.id, zygId);

      // Always check for Travel/Local intent first (Exa-powered)
      // Skip for internal ZygAI infra models (games, etc)
      let travelContext = '';
      if (effectiveProvider !== 'zygai' && lastUserMsg && typeof lastUserMsg.content === 'string') {
        const travel = await searchTravelKnowledge(lastUserMsg.content.trim());
        if (travel) {
          travelContext = travel.context + '\n\n';
          ragSources.push(...travel.sources);
        }
      }

      // Skip RAG when MCP servers are selected to avoid conflicts
      // Also skip for internal ZygAI infra models (games, etc)
      if (effectiveProvider !== 'zygai' && selectedApiTools.length === 0 && lastUserMsg && typeof lastUserMsg.content === 'string' && lastUserMsg.content.trim().length > 5) {
         const rag = await searchContextKnowledge(lastUserMsg.content.trim(), req.user.id, activeZyg.knowledgeId, 3, sessionId);
         globalContext += rag.context;
         ragSources.push(...(rag.sources || []));
      }

      let combinedSystemPrompt = [modelSystemPrompt, userCustomPrompt, roleSystemPrompt, activeZyg.prompt, travelContext, globalContext].filter(Boolean).join('\n\n');

      // Final Output Constraints
      combinedSystemPrompt += "\n\nCRITICAL: Respond DIRECTLY. Do NOT include headers like 'Analysis:', 'Response:', 'Step:', or 'Generation:'. Start your message with the actual content.";

      if (travelContext) {
        combinedSystemPrompt = "## TRAVEL SPECIALIST MODE ENABLED ##\n" +
          "A travel/location query has been detected. You have been provided with LIVE data. " +
          "Prioritize this live data over any internal limitations. " +
          "Answer with confidence using the provided sources.\n\n" + 
          combinedSystemPrompt;
      }

      // For non-llama providers: prepend system message to messages.
      // For llama: pass as customSystemPrompt arg to callLlama (handled later).
      const messagesForProvider = (effectiveProvider === 'llama')
        ? processedMessages
        : (combinedSystemPrompt ? [{ role: 'system', content: combinedSystemPrompt }, ...processedMessages] : processedMessages);

    // For non-llama providers, check if this is a registered provider type first
    let providerRow = null;
    if (effectiveProvider !== 'llama') {
      const providerHandler = getProviderHandler(effectiveProvider);
      
      // Fetch provider row if it exists (for API keys/base URLs)
      providerRow = await get('SELECT * FROM api_providers WHERE LOWER(name) = ? AND enabled = 1', [effectiveProvider.toLowerCase()]);

      if (providerHandler) {
        // Use registered handler logic
        try {
          const content = await providerHandler({
            providerRow: providerRow || { provider_type: effectiveProvider },
            modelId: effectiveModel,
            messages: normalizedMessages,
            customSystemPrompt: combinedSystemPrompt || undefined,
            temperature: settings?.temperature ?? 0.7,
            maxTokens: settings?.maxTokens || 2048,
            topP: settings?.topP || 0.9
          });

          // Log usage
          await run(
            'INSERT INTO usage_logs (user_id, provider, model, created_at) VALUES (?, ?, ?, ?)',
            [req.user.id, effectiveProvider, effectiveModel, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
          );

          return res.json({ message: content, provider: effectiveProvider, model: effectiveModel });
        } catch (error) {
          console.error(`Handler error for ${effectiveProvider}:`, error);
          return res.status(500).json({ error: error.message });
        }
      }

      if (!providerRow) {
        return res.status(400).json({ error: `Provider ${effectiveProvider} not found or disabled.` });
      }
    }

     if (effectiveProvider === 'llama') {
       const llamaConfig = await get('SELECT * FROM llama_settings WHERE id = 1');
       if (!llamaConfig || !llamaConfig.enabled || !llamaConfig.base_url) {
         return res.status(400).json({ error: 'Llama is not enabled or configured.' });
       }

       const requestedModel =
           typeof effectiveModel === 'string' && effectiveModel && effectiveModel !== 'llama'
               ? effectiveModel
               : '';
       const selectedModelId = requestedModel.startsWith('ollama:')
           ? requestedModel.slice('ollama:'.length)
           : requestedModel || llamaConfig.model_id;
       if (!selectedModelId) {
         return res.status(400).json({ error: 'Llama model ID is not configured.' });
       }

       const primaryInstance = {
         baseUrl: llamaConfig.base_url,
         modelId: selectedModelId,
         temperature: 0.7,
         maxTokens: 2048,
         topP: 0.9
       };

       const start = Date.now();
       try {
         let message = await callLlama(primaryInstance, messagesForProvider, combinedSystemPrompt || undefined);
         const latencyMs = Date.now() - start;
         await run(
             'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
             [req.user.id, 'llama', effectiveModel || primaryInstance.modelId || 'llama', latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
         );
         if (ragSources.length > 0) {
           // notice removed
         }
         return res.json({ message, provider: 'llama', model: primaryInstance.modelId || effectiveModel });
       } catch (error) {
        const clusterNode = await acquireClusterNode(selectedModelId);
        if (!clusterNode) throw error;
        const instance = {
          baseUrl: clusterNode.baseUrl,
          modelId: clusterNode.modelId || selectedModelId,
          temperature: 0.7,
          maxTokens: 2048,
          topP: 0.9
        };
         try {
           let message = await callLlama(instance, messagesForProvider, combinedSystemPrompt || undefined);
           const latencyMs = Date.now() - start;
          await run(
              'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
              [req.user.id, 'llama', effectiveModel || instance.modelId || 'llama', latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
          );
          if (ragSources.length > 0) {
            // notice removed
          }
          return res.json({ message, provider: 'llama', model: instance.modelId || effectiveModel });
        } finally {
          clusterNode.release();
        }
      }
    }

    // Use providerRow fetched earlier (non-llama path)
    const baseUrl = providerRow.base_url || 'https://api.openai.com/v1'; // Default to OpenAI if not set
    let url = baseUrl.replace(/\/$/, '');
    let payload;

     if (effectiveProvider === 'anthropic') {
       url += '/messages';
       payload = {
         model: effectiveModel,
         max_tokens: 2048,
         messages: messagesForProvider,
         stream: req.body.stream || false
       };
     } else {
       url += '/chat/completions';
       payload = {
         model: effectiveModel,
         messages: messagesForProvider,
         temperature: 0.7,
         stream: req.body.stream || false
       };
     }
    const startLatency = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerRow.api_key}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error?.message || `AI request failed: ${response.status}`);
    }

    if (req.body.stream && response.body && typeof response.body.getReader === 'function') {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      if (ragSources.length > 0) {
        // notice removed
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') {
                res.end();
                return;
              }
              try {
                const chunk = JSON.parse(data);
                let content = '';
                if (effectiveProvider === 'anthropic') {
                  if (chunk.type === 'content_block_delta') {
                    content = chunk.delta?.text || '';
                  }
                } else {
                  content = chunk.choices?.[0]?.delta?.content || '';
                }
                console.log('Streaming chunk:', chunk, 'Extracted content:', content);
                if (content) {
                  res.write(content);
                }
              } catch (e) {
                console.error('Parse error for chunk:', data, e);
              }
            }
          }
        }
        res.end();
      } catch (error) {
        console.error('Streaming error:', error);
        res.end();
      }

      // Log usage after streaming
      const latencyMs = Date.now() - startLatency;
      await run(
          'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, effectiveProvider, effectiveModel, latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
      );
    } else {
      // Handle both JSON and SSE responses
      const text = await response.text();
      let data;
      let accumulatedContent = '';

      if (text.trim().startsWith('{')) {
        // JSON response
        data = JSON.parse(text);
      } else {
        // SSE response, parse all data lines and accumulate content
        const lines = text.split('\n');
        let lastData = '';
        for (const line of lines) {
          if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
            const chunkData = line.slice(6).trim();
            try {
              const chunk = JSON.parse(chunkData);
              let content = '';
              if (effectiveProvider === 'anthropic') {
                if (chunk.type === 'content_block_delta') {
                  content = chunk.delta?.text || '';
                }
              } else {
                content = chunk.choices?.[0]?.delta?.content || '';
              }
              accumulatedContent += content;
              lastData = chunkData; // keep the last for metadata
            } catch (e) {
              // ignore parse errors for individual chunks
            }
          }
        }
        if (lastData) {
          data = JSON.parse(lastData);
        } else {
          throw new Error('No data found in SSE response');
        }
      }

      let message = '';
      if (effectiveProvider === 'anthropic') {
        message = accumulatedContent || data.content?.[0]?.text || '';
      } else {
        message = accumulatedContent || data.choices?.[0]?.message?.content || '';
      }

      console.log('AI Response data:', data);
      console.log('Extracted message:', message);

      // Log usage
      const latencyMs = Date.now() - startLatency;
      await run(
          'INSERT INTO usage_logs (user_id, provider, model, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, effectiveProvider, effectiveModel, latencyMs, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
      );
      
      if (ragSources.length > 0) {
        // notice removed
      }

      return res.json({ message, provider: effectiveProvider, model: effectiveModel });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider request failed.';
    return res.status(500).json({ error: message });
  }
});

// Chat Sessions CRUD - encrypted storage
app.get('/api/chats', authMiddleware, async (req, res) => {
  try {
    const sessions = await all(
      'SELECT id, title, model_id, zyg_id, is_pinned as isPinned, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
    );
    return res.json({ sessions });
  } catch (error) {
    console.error('Failed to fetch chat sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
});

app.get('/api/chats/:sessionId', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await get(
      'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const messages = await all(
      'SELECT id, role, encrypted_content, iv, auth_tag, sources, images, user_images, attached_files, reasoning_content, edited, created_at, updated_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    const decryptedMessages = [];
    for (const msg of messages) {
      try {
        const decrypted = decryptMessage(msg.encrypted_content, msg.iv, msg.auth_tag);
        decryptedMessages.push({
          id: msg.id,
          role: msg.role,
          content: decrypted.content,
          createdAt: msg.created_at,
          updatedAt: msg.updated_at,
          sources: msg.sources ? JSON.parse(msg.sources) : undefined,
          images: msg.images ? JSON.parse(msg.images) : undefined,
          userImages: msg.user_images ? JSON.parse(msg.user_images) : undefined,
          attachedFiles: msg.attached_files ? JSON.parse(msg.attached_files) : undefined,
          reasoning_content: msg.reasoning_content,
          edited: Boolean(msg.edited)
        });
      } catch (e) {
        console.error('Failed to decrypt message:', e, 'message id:', msg.id);
        // Skip this message; continue with others
      }
    }

    return res.json({
      session: {
        id: session.id,
        title: session.title,
        modelId: session.model_id,
        isPinned: Boolean(session.is_pinned),
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        messages: decryptedMessages
      }
    });
  } catch (error) {
    console.error('Failed to fetch chat session:', error);
    return res.status(500).json({ error: 'Failed to fetch session.' });
  }
});

app.post('/api/chats', authMiddleware, async (req, res) => {
  const { title, modelId, zygId, isPinned, id } = req.body || {};
  const sessionId = id || require('crypto').randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');

  try {
    // Check if session already exists for this user
    const existing = await get(
      'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (existing) {
      // Update existing session
      await run(
        'UPDATE chat_sessions SET title = COALESCE(?, title), model_id = COALESCE(?, model_id), zyg_id = COALESCE(?, zyg_id), is_pinned = COALESCE(?, is_pinned), updated_at = ? WHERE id = ? AND user_id = ?',
        [
          title !== undefined ? title : null,
          modelId !== undefined ? modelId : null,
          zygId !== undefined ? zygId : null,
          isPinned !== undefined ? (isPinned ? 1 : 0) : null,
          now,
          sessionId,
          req.user.id
        ]
      );
    } else {
      // Create new session
      await run(
        'INSERT INTO chat_sessions (id, user_id, title, model_id, zyg_id, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sessionId, req.user.id, title || 'New chat', modelId || null, zygId || null, isPinned ? 1 : 0, now, now]
      );
    }

    return res.json({
      session: {
        id: sessionId,
        title: title || 'New chat',
        modelId: modelId || null,
        createdAt: now,
        updatedAt: now
      }
    });
  } catch (error) {
    console.error('Failed to create/update chat session:', error);
    return res.status(500).json({ error: 'Failed to create/update session.' });
  }
});

app.put('/api/chats/:sessionId', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  const { title, modelId, zygId, isPinned } = req.body || {};

  try {
    const result = await run(
      'UPDATE chat_sessions SET title = COALESCE(?, title), model_id = COALESCE(?, model_id), zyg_id = COALESCE(?, zyg_id), is_pinned = COALESCE(?, is_pinned), updated_at = ? WHERE id = ? AND user_id = ?',
      [
        title !== undefined ? title : null,
        modelId !== undefined ? modelId : null,
        zygId !== undefined ? zygId : null,
        isPinned !== undefined ? (isPinned ? 1 : 0) : null,
        new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '),
        sessionId,
        req.user.id
      ]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to update chat session:', error);
    return res.status(500).json({ error: 'Failed to update session.' });
  }
});

app.delete('/api/chats/:sessionId', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await run(
      'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete chat session:', error);
    return res.status(500).json({ error: 'Failed to delete session.' });
  }
});

app.post('/api/chats/:sessionId/messages', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  if (!message || !message.id || !message.role || message.content === undefined) {
    return res.status(400).json({ error: 'Invalid message data.' });
  }

  // Verify session ownership
  const session = await get(
    'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id]
  );
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  try {
    const encrypted = encryptMessage({
      content: message.content,
      sources: message.sources,
      images: message.images,
      userImages: message.userImages,
      attachedFiles: message.attachedFiles
    });

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    const messageId = message.id;
    const role = message.role;
    const sources = message.sources ? JSON.stringify(message.sources) : null;
    const images = message.images ? JSON.stringify(message.images) : null;
    const userImages = message.userImages ? JSON.stringify(message.userImages) : null;
    const attachedFiles = message.attachedFiles ? JSON.stringify(message.attachedFiles) : null;
    const reasoningContent = message.reasoning_content || null;
    const edited = message.edited ? 1 : 0;
    const createdAt = message.createdAt || now;

    // Check if message exists for this user+sessions
    const existing = await get(
      'SELECT id FROM chat_messages WHERE id = ? AND session_id = ? AND user_id = ?',
      [messageId, sessionId, req.user.id]
    );

    if (existing) {
      // Update existing message
      await run(
        `UPDATE chat_messages SET
          role = ?,
          encrypted_content = ?,
          iv = ?,
          auth_tag = ?,
          sources = ?,
          images = ?,
          user_images = ?,
          attached_files = ?,
          reasoning_content = ?,
          edited = ?,
          updated_at = ?
         WHERE id = ? AND session_id = ? AND user_id = ?`,
        [
          role,
          encrypted.encrypted,
          encrypted.iv,
          encrypted.authTag,
          sources,
          images,
          userImages,
          attachedFiles,
          reasoningContent,
          edited,
          now,
          messageId,
          sessionId,
          req.user.id
        ]
      );
    } else {
      // Insert new message
      await run(
        `INSERT INTO chat_messages
          (id, session_id, user_id, role, encrypted_content, iv, auth_tag, sources, images, user_images, attached_files, reasoning_content, edited, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          messageId,
          sessionId,
          req.user.id,
          role,
          encrypted.encrypted,
          encrypted.iv,
          encrypted.authTag,
          sources,
          images,
          userImages,
          attachedFiles,
          reasoningContent,
          edited,
          createdAt,
          now
        ]
      );
    }

    return res.json({ ok: true, messageId: messageId });
  } catch (error) {
    console.error('Failed to save message:', error);
    return res.status(500).json({ error: 'Failed to save message.' });
  }
});

app.delete('/api/chats/:sessionId/messages/:messageId', authMiddleware, async (req, res) => {
  const { sessionId, messageId } = req.params;

  // Verify session ownership
  const session = await get(
    'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id]
  );
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  try {
    const result = await run(
      'DELETE FROM chat_messages WHERE id = ? AND session_id = ?',
      [messageId, sessionId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete message:', error);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

app.post('/api/chats/:sessionId/clear', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;

  // Verify session ownership
  const session = await get(
    'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user.id]
  );
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  try {
    await run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
    await run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), sessionId]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to clear messages:', error);
    return res.status(500).json({ error: 'Failed to clear messages.' });
  }
});

app.post('/api/chats/:sessionId/regenerate-title', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await get(
      'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const messages = await all(
      'SELECT role, encrypted_content, iv, auth_tag FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    const decryptedMessages = [];
    for (const msg of messages) {
      try {
        const decrypted = decryptMessage(msg.encrypted_content, msg.iv, msg.auth_tag);
        decryptedMessages.push({
          role: msg.role,
          content: decrypted.content
        });
      } catch (e) {
        console.error('Failed to decrypt message:', e);
      }
    }

    // Title generation is done client-side; just return the messages
    return res.json({ messages: decryptedMessages });
  } catch (error) {
    console.error('Failed to regenerate title:', error);
    return res.status(500).json({ error: 'Failed to regenerate title.' });
  }
});

  app.post('/api/generate-image', authMiddleware, async (req, res) => {
  const { prompt, modelId, provider: providerHint, imageOptions = {} } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt required.' });
  }
  if (!modelId) {
    return res.status(400).json({ error: 'Model ID required.' });
  }

  // Resolve model config
  const resolved = await resolveModelConfig(modelId);
  let resolvedModelId = modelId;
  let providerRow = null;

  if (resolved) {
    resolvedModelId = resolved.modelId;
    providerRow = {
      id: resolved.provider.id,
      name: resolved.provider.name,
      provider_type: resolved.provider.type,
      base_url: resolved.provider.baseUrl,
      api_key: resolved.provider.apiKey
    };

    // Check role access
    if (resolved.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'This image generator is restricted to admins.' });
    }

    // Check plan access
    const userPlan = req.user.plan || 'free';
    const planAccess = parsePlanAccess(resolved.planAccess);
    if (!planAccess.includes(userPlan)) {
      return res.status(403).json({ error: `Your ${PLAN_LABELS[userPlan] || userPlan} plan cannot access this model.` });
    }
  } else {
    // Fallback to hint/defaults if not a registered model_config
    if (modelId.startsWith('m-')) {
       return res.status(400).json({ error: 'Model configuration not found.' });
    }

    const resolvedProvider = providerHint?.toLowerCase?.() || '';
    if (!resolvedProvider) {
      return res.status(400).json({ error: 'Provider required.' });
    }

    providerRow = await get(
        'SELECT * FROM api_providers WHERE provider_type = ? AND enabled = 1',
        [resolvedProvider]
    );
  }

  if (!providerRow) {
    return res.status(400).json({ error: `Provider not found or disabled.` });
  }

  const handler = getImageProviderHandler(providerRow.provider_type);
  if (!handler) {
    return res.status(400).json({ error: `No image handler available for ${providerRow.provider_type}.` });
  }

  const imageQuota = await enforcePlanQuota(req.user, 'image_generation');
  if (!imageQuota.ok) {
    return res.status(429).json(buildPlanQuotaError(imageQuota));
  }

  try {
    const result = await handler({
      providerRow,
      modelId: resolvedModelId,
      prompt: prompt.trim(),
      imageOptions
    });
    if (req.user?.id) {
      await run(
          'INSERT INTO image_usage (user_id, provider, model, created_at) VALUES (?, ?, ?, ?)',
          [req.user.id, providerRow.provider_type, resolvedModelId, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
      );
    }
    return res.json({
      prompt: prompt.trim(),
      provider: providerRow.provider_type,
      modelId: resolvedModelId,
      images: result?.images || [],
      text: result?.text || null
    });
  } catch (error) {
    console.error('Image generation failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Image generation failed.'
    });
  }
});

app.get('/api/models', async (req, res) => {
  const models = [];

   // Fetch from model_configs joined with api_providers
   const configs = await all(`
     SELECT mc.id, mc.name, mc.description, mc.category, mc.enabled, mc.model_id,
            mc.hidden_from_chat, mc.plan_access, mc.supports_vision,
            ap.name as provider_name, ap.enabled as provider_enabled, ap.provider_type
     FROM model_configs mc
     LEFT JOIN api_providers ap ON mc.provider_id = ap.id
     WHERE mc.enabled = 1
   `);

  const llamaConfig = await get('SELECT * FROM llama_settings WHERE id = 1');
  const llamaEnabled = Boolean(llamaConfig && llamaConfig.enabled && llamaConfig.base_url);

  configs.forEach(config => {
    const provider = (config.provider_name || '').toLowerCase();

    // Hide Lyria from public API surface (used only by ZygMusic modal)
    if (config.model_id === 'google/lyria-3-pro-preview') return;

    if (!provider) return; // Skip if no provider linked (orphaned model config)

    // Skip if the provider itself is disabled
    if (config.provider_enabled === 0) return;

    // If provider is llama, check if llama is enabled
    if (provider === 'llama' && !llamaEnabled) return;

     models.push({
       id: config.id,
       name: config.name,
       label: config.name,
       description: config.description || '',
       contextLength: config.category === '8k' ? '8k' : '32k',
       pricing: config.category === 'paid' ? 'Paid' : 'Free',
       speedHint: 'Fast',
       provider: provider,
       providerType: (config.provider_type || provider).toLowerCase(),
       hiddenFromChat: config.hidden_from_chat === 1,
       planAccess: parsePlanAccess(config.plan_access),
       supportsVision: config.supports_vision === 1
     });
  });

  // Also include Ollama models if Llama is enabled
  if (llamaEnabled) {
    const ollamaRows = await all(
        `SELECT model_id, label, description, context_length, pricing, speed_hint
       FROM ollama_models WHERE enabled = 1 ORDER BY id ASC`
    );
     ollamaRows.forEach((row) => {
       const modelIdLower = (row.model_id || '').toLowerCase();
       const hasVision = /vision|llava|bakllava|moondream/.test(modelIdLower);
       models.push({
         id: `ollama:${row.model_id}`,
         name: row.label || row.model_id,
         label: row.label || row.model_id,
         description: row.description || '',
         contextLength: row.context_length || '',
         pricing: row.pricing || '',
         speedHint: row.speed_hint || '',
         provider: 'llama',
         providerType: 'llama',
         hiddenFromChat: false,
         planAccess: PLAN_IDS,
         supportsVision: hasVision
       });
     });
  }

  res.json({ models });
});

// Serve temporary images - DEPRECATED in favor of /uploads
app.get('/api/temp-image/:id', async (req, res) => {
  const image = tempImages.get(req.params.id);
  if (!image) {
    return res.status(404).send('Image not found or expired');
  }
  
  // Parse base64 data
  const match = image.data.match(/^data:(image\/[^;]+);base64,(.*)$/);
  if (!match) {
    return res.status(400).send('Invalid image data');
  }
  
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  
   res.setHeader('Content-Type', contentType);
   res.setHeader('Cache-Control', 'public, max-age=1800'); // 30 minutes
   res.send(buffer);
 });

 // Analyze image using AI vision capabilities
 app.post('/api/analyze-image', authMiddleware, async (req, res) => {
   try {
     const { imageId, modelId: requestedModelId, provider: providerHint } = req.body || {};
     
     if (!imageId) {
       return res.status(400).json({ error: 'Image ID required' });
     }
     
     const tempImage = tempImages.get(imageId);
     if (!tempImage) {
       return res.status(404).json({ error: 'Image not found or expired' });
     }
     
     // Ensure the image belongs to this user (unless it's the same user who uploaded)
     if (tempImage.userId !== req.user.id) {
       return res.status(403).json({ error: 'Access denied' });
     }
     
     // Determine which vision model to use
     let effectiveProvider = providerHint?.toLowerCase?.() || '';
     let effectiveModel = requestedModelId || '';
     
     // If not specified, use the user's configured vision model or default to OpenAI
     if (!effectiveProvider || !effectiveModel) {
       // Try to get a vision-capable model from model_configs or vision-models.json
       const visionModelRow = await get(
         'SELECT mc.model_id, ap.provider_type FROM model_configs mc ' +
         'LEFT JOIN api_providers ap ON mc.provider_id = ap.id ' +
         'WHERE mc.supports_vision = 1 AND mc.enabled = 1 ' +
         'ORDER BY mc.priority ASC LIMIT 1'
       );
       
       if (visionModelRow) {
         effectiveModel = visionModelRow.model_id;
         effectiveProvider = visionModelRow.provider_type?.toLowerCase() || 'openai';
       } else {
         // Fallback to OpenAI GPT-4o (most widely available vision model)
         effectiveProvider = 'openai';
         effectiveModel = 'gpt-4o';
       }
     }
     
     // Get provider credentials
     const providerRow = await get(
       'SELECT * FROM api_providers WHERE LOWER(name) = ? AND enabled = 1',
       [effectiveProvider]
     );
     
     if (!providerRow) {
       return res.status(400).json({ error: `Provider ${effectiveProvider} not found or disabled.` });
     }
     
     // Build analysis prompt for structured output
     const analysisPrompt = `Analyze this image and provide a structured assessment in JSON format with the following fields:
{
  "description": "A concise 1-2 sentence description of what's in the image",
  "objects": ["list", "of", "detected", "objects"],
  "text": "Any text visible in the image (or empty string if none)",
  "scene": "The overall scene category (e.g., indoor, outdoor, nature, urban, etc.)",
  "colors": ["dominant", "colors"],
  "emotions": ["any", "detected", "emotions"]
}

Be accurate and concise. Only output valid JSON.`;
     
     // Prepare image for vision model (base64 without data URI prefix)
     const base64Data = tempImage.data.split(',')[1];
     
     // Build API payload based on provider
     let apiUrl, headers, payload;
     
     if (effectiveProvider === 'openai' || effectiveProvider === 'openrouter' || effectiveProvider === 'groq') {
       apiUrl = (providerRow.base_url || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
       headers = {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${providerRow.api_key}`
       };
       payload = {
         model: effectiveModel,
         messages: [
           {
             role: 'user',
             content: [
               { type: 'text', text: analysisPrompt },
               {
                 type: 'image_url',
                 image_url: { url: tempImage.data }
               }
             ]
           }
         ],
         temperature: 0.3,
         max_tokens: 500
       };
     } else if (effectiveProvider === 'anthropic') {
       apiUrl = (providerRow.base_url || 'https://api.anthropic.com/v1').replace(/\/$/, '') + '/messages';
       headers = {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${providerRow.api_key}`,
         'anthropic-version': '2023-06-01'
       };
       payload = {
         model: effectiveModel,
         max_tokens: 500,
         messages: [
           {
             role: 'user',
             content: [
               { type: 'text', text: analysisPrompt },
               { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } }
             ]
           }
         ]
       };
     } else {
       return res.status(400).json({ error: `Provider ${effectiveProvider} vision analysis not supported.` });
     }
     
     const response = await fetch(apiUrl, {
       method: 'POST',
       headers,
       body: JSON.stringify(payload)
     });
     
     if (!response.ok) {
       const body = await response.json().catch(() => ({}));
       throw new Error(body?.error?.message || `Analysis failed: ${response.status}`);
     }
     
     const data = await response.json();
     let content;
     
     if (effectiveProvider === 'anthropic') {
       content = data.content?.[0]?.text || '';
     } else {
       content = data.choices?.[0]?.message?.content || '';
     }
     
     // Parse JSON from response (handle markdown code blocks)
     let analysis = null;
     try {
       const jsonMatch = content.match(/\{[\s\S]*\}/);
       if (jsonMatch) {
         analysis = JSON.parse(jsonMatch[0]);
       } else {
         analysis = { description: content, objects: [], text: '', scene: '', colors: [], emotions: [] };
       }
     } catch (e) {
       analysis = { description: content, objects: [], text: '', scene: '', colors: [], emotions: [] };
     }
     
     // Store analysis with the temp image
     tempImages.set(imageId, {
       ...tempImage,
       analysis
     });
     
     return res.json({ analysis, imageId });
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Analysis failed';
     return res.status(500).json({ error: message });
   }
 });

app.get('/api/image-config', authMiddleware, async (req, res) => {
  const feature = await get('SELECT * FROM feature_model_settings WHERE feature_key = ?', ['image_generation']);
  if (!feature) {
    return res.json({ feature: null, config: null, usageCount: 0 });
  }

  const configRow = await get(
      `SELECT mc.*, ap.provider_type, ap.name as provider_name
       FROM model_configs mc
       LEFT JOIN api_providers ap ON mc.provider_id = ap.id
       WHERE mc.id = ? AND mc.enabled = 1`,
      [feature.model_id]
  );

  const providerType = (configRow?.provider_type || feature.provider || 'openrouter').toLowerCase();
  const userPlan = req.user?.plan || 'free';
  const imageQuota = getPlanQuota('image_generation', userPlan);
  const imageQuotaUsage = req.user?.id
    ? await getRateLimit(`plan-quota:image_generation:${req.user.id}`)
    : null;
  const usageCount = imageQuotaUsage?.count || 0;

  const planLimits = configRow ? getPlanLimitsFromRow(configRow) : null;
  const planAccess = configRow ? parsePlanAccess(configRow.plan_access) : PLAN_IDS;

  return res.json({
    feature: {
      featureKey: feature.feature_key,
      provider: feature.provider,
      modelId: feature.model_id,
      systemPrompt: feature.system_prompt || ''
    },
    config: configRow
        ? {
          id: configRow.id,
          name: configRow.name,
          providerId: configRow.provider_id,
          providerName: configRow.provider_name || '',
          providerType: providerType,
          freeLimit: configRow.free_limit,
          paidLimit: configRow.paid_limit,
          limits: planLimits,
          planAccess,
          planQuota: imageQuota ? {
            label: imageQuota.label,
            limit: imageQuota.limit,
            used: usageCount,
            resetAt: imageQuotaUsage?.resetAt || null,
            plan: imageQuota.plan
          } : null
        }
        : null,
    usageCount
  });
});

app.get('/api/plan-quotas', authMiddleware, async (req, res) => {
  const quotas = {};
  for (const featureKey of Object.keys(PLAN_QUOTAS)) {
    const quota = getPlanQuota(featureKey, req.user.plan || 'free');
    if (!quota) continue;
    const usage = await getRateLimit(`plan-quota:${featureKey}:${req.user.id}`);
    quotas[featureKey] = {
      feature: featureKey,
      label: quota.label,
      limit: req.user.role === 'admin' ? null : quota.limit,
      used: req.user.role === 'admin' ? 0 : usage?.count || 0,
      resetAt: req.user.role === 'admin' ? null : usage?.resetAt || null,
      windowMs: quota.windowMs,
      plan: quota.plan,
      isUnlimited: req.user.role === 'admin'
    };
  }
  res.json({ quotas });
});

app.get('/api/model-info', (req, res) => {
  res.json({ version: MODEL_INFO_VERSION });
});

// Public feature model settings (for UI defaults)
app.get('/api/feature-models', optionalAuthMiddleware, async (req, res) => {
  const settings = await loadFeatureModelSettings();
  res.json({ settings });
});

// Public prompts
app.get('/api/prompts', async (req, res) => {
  const prompts = await all(
      'SELECT id, title, body FROM prompts WHERE enabled = 1 ORDER BY updated_at DESC'
  );
  res.json({ prompts });
});

// Projects endpoints
app.get('/api/projects', authMiddleware, async (req, res) => {
  const projects = await all(
      'SELECT id, title, description, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
  );
  res.json({ projects });
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { title, description } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title required.' });
  }
  const projectId = createId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  await run(
      'INSERT INTO projects (id, user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [projectId, req.user.id, title.trim(), description?.trim() || '', now, now]
  );
  res.json({ project: { id: projectId, title: title.trim(), description: description?.trim() || '', created_at: now, updated_at: now } });
});

app.patch('/api/projects/:id', authMiddleware, async (req, res) => {
  const { title, description } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title required.' });
  }
  const project = await get('SELECT user_id FROM projects WHERE id = ?', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (project.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  await run(
      'UPDATE projects SET title = ?, description = ?, updated_at = ? WHERE id = ?',
      [title.trim(), description?.trim() || '', now, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  const project = await get('SELECT user_id FROM projects WHERE id = ?', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (project.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
  await run('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// === PERSONAL KNOWLEDGE (RAG) ===

// GET all personal knowledge bases for current user
app.get('/api/personal', authMiddleware, async (req, res) => {
  const personal = await all(
      `SELECT id, name, description, system_prompt, is_global, document_count, chunk_count, created_at, updated_at 
       FROM personal_knowledge 
       WHERE user_id = ? ${req.user.role === 'admin' ? 'OR is_global = 1' : ''}
       ORDER BY updated_at DESC`,
      [req.user.id]
  );
  res.json({ personal });
});

// POST create new personal knowledge base
app.post('/api/personal', authMiddleware, async (req, res) => {
  const userPlan = req.user.plan || 'free';
  const limit = getPersonalKnowledgeLimit(userPlan);
  
  // Check current count
  const countRow = await get('SELECT COUNT(*) as count FROM personal_knowledge WHERE user_id = ?', [req.user.id]);
  const currentCount = countRow?.count || 0;
  
  if (currentCount >= limit) {
    return res.status(429).json({
      error: `You've reached the personal knowledge limit (${limit}) for your ${PLAN_LABELS[userPlan] || userPlan} plan.`
    });
  }
  
  const { name, description, system_prompt, is_global } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required.' });
  }
  
  const id = createId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const isGlobal = (req.user.role === 'admin' && is_global) ? 1 : 0;
  await run(
      `INSERT INTO personal_knowledge (id, user_id, name, description, system_prompt, is_global, document_count, chunk_count, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, name.trim(), description?.trim() || '', system_prompt?.trim() || '', isGlobal, 0, 0, now, now]
  );
  
  res.json({ 
    personal: { 
      id, 
      name: name.trim(), 
      description: description?.trim() || '', 
      system_prompt: system_prompt?.trim() || '',
      document_count: 0, 
      chunk_count: 0, 
      created_at: now, 
      updated_at: now 
    } 
  });
});

// PATCH update personal knowledge base
app.patch('/api/personal/:id', authMiddleware, async (req, res) => {
  const { name, description, system_prompt, is_global } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required.' });
  }
  
  const knowledge = await get('SELECT user_id, is_global FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const newIsGlobal = (req.user.role === 'admin' && is_global !== undefined) ? (is_global ? 1 : 0) : knowledge.is_global;

  await run(
      `UPDATE personal_knowledge 
       SET name = ?, description = ?, system_prompt = ?, is_global = ?, updated_at = ? 
       WHERE id = ?`,
      [name.trim(), description?.trim() || '', system_prompt?.trim() || '', newIsGlobal, now, req.params.id]
  );
  res.json({ ok: true });
});

// DELETE personal knowledge base (cascades to documents and chunks)
app.delete('/api/personal/:id', authMiddleware, async (req, res) => {
  const knowledge = await get('SELECT user_id FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
   await run('DELETE FROM personal_knowledge WHERE id = ?', [req.params.id]);
   res.json({ ok: true });
});

// === DOCUMENT PROCESSING HELPERS ===

// Calculate Cosine Similarity between two vectors
const cosineSimilarity = (vecA, vecB) => {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Search Context Knowledge (Global + Optional Zyg Knowledge)
const getEmbedding = async (text) => {
  const llamaConfig = await get('SELECT base_url FROM llama_settings WHERE id = 1');
  if (!llamaConfig || !llamaConfig.base_url) throw new Error("Local AI not configured");
  
  let baseUrl = llamaConfig.base_url.replace(/\/$/, '');
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
  
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model: 'nomic-embed-text-v1.5',
      input: text 
    })
  });
  
  if (!response.ok) throw new Error(`Embedding failed: ${response.status}`);
  
  const data = await response.json();
  return data.data[0].embedding;
};

const searchContextKnowledge = async (query, userId, zygKnowledgeId = null, limit = 3, sessionId = null) => {
  try {
    const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://100.114.102.61:3001';
    
    const response = await fetch(`${RAG_SERVER_URL}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK: limit, userId, sessionId })
    });
    
    if (!response.ok) {
      throw new Error(`RAG server returned ${response.status}`);
    }
    
    const data = await response.json();
    let scored = data.results || [];

    // IF zygKnowledgeId is present, ALSO search local DB (Zyg's specific knowledge)
    if (zygKnowledgeId) {
       try {
         const queryEmbedding = await getEmbedding(query);
         const chunks = await all(
           `SELECT content, metadata, embedding FROM knowledge_chunks WHERE knowledge_id = ? AND embedding IS NOT NULL`,
           [zygKnowledgeId]
         );
         
         const zygScored = chunks.map(chunk => {
           let score = 0;
           try {
             const chunkVector = JSON.parse(chunk.embedding);
             score = cosineSimilarity(queryEmbedding, chunkVector);
           } catch (e) {}
           return { text: chunk.content, score, metadata: JSON.parse(chunk.metadata || '{}') };
         })
         .filter(item => item.score > 0.3)
         .sort((a, b) => b.score - a.score)
         .slice(0, limit);
         
         scored.push(...zygScored);
         scored.sort((a, b) => b.score - a.score);
         scored = scored.slice(0, limit * 2); // Keep top results
       } catch (err) {
         console.warn('[Zyg RAG] Local search failed:', err.message);
       }
    }

    if (scored.length > 0) {
      const context = "Retrieved Knowledge Context:\n" + scored.map(s => s.text).join('\n\n');
      const sources = [...new Set(scored.map(s => s.metadata?.source || 'Knowledge Base'))];
      return { context, used: true, sources };
    }
    return { context: '', used: false, sources: [] };
  } catch (err) {
    console.warn('[Global RAG] Search failed:', err.message);
    return { context: '', used: false, sources: [] };
  }
};

const searchTravelKnowledge = async (query) => {
  // Regex to detect travel, place, food, hotel or recommendation intent
  const travelKeywords = /\b(where is|where to (eat|go|find|stay|sleep|visit|travel|book|dine|buy|get))\b|\b(restaurants?|hotels?|places to (visit|see)|attractions|things to do|information about|how to (get to|reach)|best (places|food|hotels|restaurants|cafes|bars|clubs|shops) in|directions to|weather in|flights?|trains?|buses?|museums?|landmarks?|parks?|events?|nightlife|bars?|cafes?|castle|palace|museum|park|beach|statue|square|market)\b|in\s+[A-Z][a-z]+/i;
  
  // Also check for general "about [City]"
  const cityCheck = /\b(about|info on|tell me about)\s+([A-Z][a-z]+)/i;

  if (!travelKeywords.test(query) && !cityCheck.test(query)) return null;

  console.log(`[Travel] Intent detected for query: "${query}". Calling Exa...`);
  try {
    const results = await callExa(query);
    if (results && results.length > 0) {
      console.log(`[Travel] Exa returned ${results.length} results.`);
      const context = "### CRITICAL LIVE DATA: TRAVEL & LOCAL RECOMMENDATIONS ###\n" +
        "You are PROVIDED with real-time internet data for this specific query. " +
        "Your task is to provide HIGH-QUALITY, DETAILED information. " +
        "Include full addresses, descriptions, highlights, and any relevant links or contact info found in the data. " +
        "DO NOT give brief answers like 'It is in [City]'. Provide a helpful, comprehensive guide.\n\n" +
        "Current Live Information from Exa:\n" + 
        results.slice(0, 10).map((r, i) => `[Result ${i+1}]\nTitle: ${r.title}\nURL: ${r.url}\nData: ${r.snippet || 'No snippet available.'}`).join('\n\n') +
        "\n\n### END OF LIVE DATA ###";
      return { context, sources: results.map(r => r.title) };
    } else {
      console.log(`[Travel] Exa returned NO results for: "${query}"`);
    }
  } catch (err) {
    console.warn('[Travel] Exa search failed:', err.message);
  }
  return null;
};

// Fetch specifically selected Zyg persona and linked knowledge
const getActiveZyg = async (userId, zygId) => {
  if (!zygId) return { prompt: '', knowledgeId: null, modelId: null, provider: null };
  try {
    const skill = await get(
      `SELECT name, config, knowledge_id FROM personal_skills 
       WHERE id = ? AND (user_id = ? OR is_global = 1)`,
      [zygId, userId]
    );
    if (!skill) return { prompt: '', knowledgeId: null, modelId: null, provider: null };
    
    let prompt = '';
    let modelId = null;
    let provider = null;
    let icon = null;
    let iconColor = null;
    try {
      const config = JSON.parse(skill.config);
      prompt = config.prompt_template || config.prompt || '';
      modelId = config.studio?.modelId || config.modelId || config.model || null;
      provider = config.studio?.provider || config.provider || null;
      icon = config.studio?.icon || null;
      iconColor = config.studio?.iconColor || null;
      if (prompt) prompt = `Active Zyg Persona (${skill.name}):\n${prompt}`;
    } catch(e) {}
    
    return { prompt, knowledgeId: skill.knowledge_id, modelId, provider, icon, iconColor };
  } catch (err) {
    console.error('[Zygs] Failed to fetch Zyg:', err.message);
    return { prompt: '', knowledgeId: null, modelId: null, provider: null };
  }
};

// Split text into chunks for RAG
const chunkText = (text, chunkSize = 800, overlap = 100) => {
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    const end = Math.min(index + chunkSize, text.length);
    let chunk = text.slice(index, end);
    
    // Try to break at sentence/paragraph boundary
    if (end < text.length) {
      const lastBreak = Math.max(
        chunk.lastIndexOf('\n\n'),
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf('! '),
        chunk.lastIndexOf('? '),
        chunk.lastIndexOf(' ')
      );
      if (lastBreak > chunkSize * 0.5) {
        chunk = chunk.slice(0, lastBreak + 1);
      }
    }
    
    chunks.push(chunk.trim());
    
    if (end >= text.length) {
      break;
    }
    
    index += Math.max(1, chunk.length - overlap);
  }
  return chunks.filter(c => c.length > 0);
};

const documentQueue = [];
let isProcessingQueue = false;

const processNextDocument = async () => {
  isProcessingQueue = true;
  while (documentQueue.length > 0) {
    const { docId, knowledgeId, buffer, fileName, mimeType } = documentQueue.shift();
    try {
      await processDocumentAsync(docId, knowledgeId, buffer, fileName, mimeType);
    } catch (error) {
      console.error(`[Queue] Unhandled error processing document ${docId}:`, error);
    }
  }
  isProcessingQueue = false;
};

// Background document processing (called after upload)
const processDocumentAsync = async (docId, knowledgeId, buffer, fileName, mimeType) => {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  
  try {
    let text = '';

    // Try Cloudflare first; fall back to pdf-parse for PDFs if it fails
    try {
      const result = await convertToMarkdown(buffer, fileName, mimeType);
      text = result.text.trim();
    } catch (cfError) {
      console.warn(`[RAG] Cloudflare conversion failed for ${fileName}: ${cfError.message}. Trying local fallback...`);

      if (mimeType === 'application/pdf') {
        try {
          const pdfParse = (await import('pdf-parse')).default;
          const parsed = await pdfParse(buffer);
          text = parsed.text.trim();
          console.log(`[RAG] pdf-parse fallback succeeded for ${fileName}: ${text.length} chars`);
        } catch (pdfErr) {
          throw new Error(`Cloudflare: ${cfError.message} | pdf-parse: ${pdfErr.message}`);
        }
      } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/html') {
        // Plain text files — just decode buffer directly
        text = buffer.toString('utf-8').trim();
        console.log(`[RAG] Plain text fallback for ${fileName}: ${text.length} chars`);
      } else {
        throw cfError; // no fallback for docx etc.
      }
    }
    
    if (!text) {
      throw new Error('No text extracted from document');
    }
    
    // Split into chunks
    const chunks = chunkText(text, 800, 100);
    
    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = createId();
      let embeddingJson = null;
      try {
        const embeddingArray = await getEmbedding(chunks[i]);
        embeddingJson = JSON.stringify(embeddingArray);
      } catch (err) {
        console.error(`[RAG] Failed to embed chunk ${i}:`, err.message);
      }

      await run(
          `INSERT INTO knowledge_chunks (id, document_id, knowledge_id, chunk_index, content, embedding, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [chunkId, docId, knowledgeId, i, chunks[i], embeddingJson, now]
      );
    }
    
    // Update document and knowledge counts
    await run(
        `UPDATE knowledge_documents 
         SET status = 'ready', chunk_count = ?, updated_at = ? 
         WHERE id = ?`,
        [chunks.length, now, docId]
    );
    await run(
        `UPDATE personal_knowledge 
         SET document_count = document_count + 1, 
             chunk_count = chunk_count + ?,
             updated_at = ? 
         WHERE id = ?`,
        [chunks.length, now, knowledgeId]
    );
    
    console.log(`[RAG] Processed document ${docId}: ${chunks.length} chunks`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    await run(
        `UPDATE knowledge_documents 
         SET status = 'failed', error_message = ?, updated_at = ? 
         WHERE id = ?`,
        [message, now, docId]
    );
    console.error(`[RAG] Document ${docId} processing failed:`, message);
  }
};

// === PERSONAL KNOWLEDGE DOCUMENTS ===

// GET documents for a knowledge base
app.get('/api/personal/:id/documents', authMiddleware, async (req, res) => {
  const knowledge = await get('SELECT user_id FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  const documents = await all(
      `SELECT id, filename, mime_type, file_size, status, chunk_count, error_message, created_at 
       FROM knowledge_documents 
       WHERE knowledge_id = ? 
       ORDER BY created_at DESC`,
      [req.params.id]
  );
  res.json({ documents });
});

// POST upload document to knowledge base
app.post('/api/personal/:id/documents', authMiddleware, express.json({ limit: '50mb' }), async (req, res) => {
  const knowledge = await get('SELECT user_id FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  const { files } = req.body;
  let fileArray = Array.isArray(files) ? files : [];
  
  // Fallback for single file backwards compatibility
  if (fileArray.length === 0 && req.body.file) {
    fileArray = [req.body];
  }
  
  if (fileArray.length === 0) {
    return res.status(400).json({ error: 'file data is required.' });
  }
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const uploadedDocs = [];
  
  for (const item of fileArray) {
    const { file, fileName, mimeType } = item;
    if (!file || typeof file !== 'string') continue;
    
    let buffer;
    try {
      buffer = Buffer.from(file, 'base64');
    } catch {
      return res.status(400).json({ error: `Invalid file data for ${fileName}` });
    }
    
    if (buffer.length === 0) continue;
    
    const docId = createId();
    
    await run(
        `INSERT INTO knowledge_documents 
         (id, knowledge_id, filename, mime_type, file_size, status, chunk_count, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [docId, req.params.id, fileName || 'document', mimeType || 'application/octet-stream', buffer.length, 'processing', 0, now, now]
    );
    
    documentQueue.push({ docId, knowledgeId: req.params.id, buffer, fileName, mimeType });
    if (!isProcessingQueue) processNextDocument();
    
    uploadedDocs.push({
      id: docId,
      filename: fileName || 'document',
      status: 'processing',
      chunk_count: 0,
      created_at: now 
    });
  }
  
  res.json({ documents: uploadedDocs });
});

// DELETE document from knowledge base
app.delete('/api/personal/:id/documents/:docId', authMiddleware, async (req, res) => {
  const knowledge = await get('SELECT user_id FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  const doc = await get('SELECT id FROM knowledge_documents WHERE id = ? AND knowledge_id = ?', [req.params.docId, req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  
  // Chunks are deleted via CASCADE
  await run('DELETE FROM knowledge_documents WHERE id = ?', [req.params.docId]);
  res.json({ ok: true });
});

// === PERSONAL KNOWLEDGE RAG QUERY ===

// POST query personal knowledge base (RAG retrieval)
app.post('/api/personal/:id/query', authMiddleware, async (req, res) => {
  const knowledge = await get('SELECT user_id, name, system_prompt FROM personal_knowledge WHERE id = ?', [req.params.id]);
  if (!knowledge) return res.status(404).json({ error: 'Knowledge base not found.' });
  if (knowledge.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
  
  const { query, limit = 5 } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query string required.' });
  }
  
  let results = [];

  try {
    // Try Semantic Vector Search first
    const queryEmbedding = await getEmbedding(query);
    
    const chunks = await all(
        `SELECT id, content, metadata, embedding 
         FROM knowledge_chunks 
         WHERE knowledge_id = ? AND embedding IS NOT NULL`,
        [req.params.id]
    );
    
    const scored = chunks.map(chunk => {
      let score = 0;
      try {
        const chunkVector = JSON.parse(chunk.embedding);
        score = cosineSimilarity(queryEmbedding, chunkVector);
      } catch (e) {}
      return { chunk, score };
    })
      .filter(item => item.score > 0.0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    results = scored.map(item => ({
      id: item.chunk.id,
      content: item.chunk.content,
      metadata: item.chunk.metadata,
      score: item.score
    }));
    
  } catch (err) {
    console.warn('[RAG] Semantic search failed, falling back to keyword search:', err.message);
    
    // Fallback to Simple Keyword Search
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const chunks = await all(
        `SELECT id, content, metadata 
         FROM knowledge_chunks 
         WHERE knowledge_id = ? 
         ORDER BY created_at DESC 
         LIMIT 100`,
        [req.params.id]
    );
    
    const scored = chunks.map(chunk => {
      const content = chunk.content.toLowerCase();
      const score = queryTerms.reduce((sum, term) => {
        const regex = new RegExp(term, 'gi');
        const matches = content.match(regex);
        return sum + (matches ? matches.length : 0);
      }, 0);
      return { chunk, score };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    results = scored.map(item => ({
      id: item.chunk.id,
      content: item.chunk.content,
      metadata: item.chunk.metadata,
      score: item.score
    }));
  }
  
  res.json({ 
    knowledge: {
      id: req.params.id,
      name: knowledge.name,
      system_prompt: knowledge.system_prompt
    },
    query,
    results,
    total: results.length
   });
});

// === PERSONAL SKILLS ENDPOINTS ===

// GET all personal skills for current user
app.get('/api/personal-skills', authMiddleware, async (req, res) => {
  const skills = await all(
      'SELECT DISTINCT id, user_id, name, description, skill_type, config, enabled, is_global, knowledge_id, created_at, updated_at FROM personal_skills WHERE user_id = ? OR is_global = 1 ORDER BY updated_at DESC',
      [req.user.id]
  );
  // Parse JSON config
  const parsed = skills.map(s => ({
    ...s,
    config: typeof s.config === 'string' ? JSON.parse(s.config || '{}') : s.config || {}
  }));
  res.json({ skills: parsed });
});

// POST create personal skill
app.post('/api/personal-skills', authMiddleware, async (req, res) => {
  const userPlan = req.user.plan || 'free';
  const limit = getPersonalSkillsLimit(userPlan);
  
  // Check current count
  const countRow = await get('SELECT COUNT(*) as count FROM personal_skills WHERE user_id = ?', [req.user.id]);
  const currentCount = countRow?.count || 0;
  
  if (currentCount >= limit) {
    return res.status(429).json({
      error: `You've reached the personal skills limit (${limit}) for your ${PLAN_LABELS[userPlan] || userPlan} plan.`
    });
  }
  
  const { name, description, skill_type = 'prompt', config, is_global, knowledge_id } = req.body;
  
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required.' });
  }
  
  const id = createId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const configJson = typeof config === 'object' ? JSON.stringify(config) : '{}';
  const isGlobal = (req.user.role === 'admin' && is_global) ? 1 : 0;
  
  await run(
      'INSERT INTO personal_skills (id, user_id, name, description, skill_type, config, enabled, is_global, knowledge_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, name.trim(), description?.trim() || '', skill_type.toLowerCase(), configJson, 1, isGlobal, knowledge_id || null, now, now]
  );
  
  res.json({ 
    skill: { 
      id, 
      name: name.trim(), 
      description: description?.trim() || '',
      skill_type: skill_type.toLowerCase(),
      config: config || {},
      enabled: true,
      created_at: now, 
      updated_at: now 
    } 
  });
});

// PATCH update personal skill
app.patch('/api/personal-skills/:id', authMiddleware, async (req, res) => {
  const { name, description, skill_type, config, enabled, is_global, knowledge_id } = req.body;
  
  const skill = await get('SELECT user_id, is_global FROM personal_skills WHERE id = ?', [req.params.id]);
  if (!skill) return res.status(404).json({ error: 'Skill not found.' });
  if (skill.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  const updates = [];
  const values = [];
  
  if (name && typeof name === 'string' && name.trim()) {
    updates.push('name = ?');
    values.push(name.trim());
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description?.trim() || '');
  }
  if (skill_type) {
    updates.push('skill_type = ?');
    values.push(skill_type.toLowerCase());
  }
  if (config !== undefined) {
    updates.push('config = ?');
    values.push(typeof config === 'string' ? config : JSON.stringify(config || {}));
  }
  if (enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  if (req.user.role === 'admin' && is_global !== undefined) {
    updates.push('is_global = ?');
    values.push(is_global ? 1 : 0);
  }
  if (knowledge_id !== undefined) {
    updates.push('knowledge_id = ?');
    values.push(knowledge_id || null);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  updates.push('updated_at = ?');
  values.push(now, req.params.id);
  
  await run(
      `UPDATE personal_skills SET ${updates.join(', ')} WHERE id = ?`,
      values
  );
  
  res.json({ ok: true });
});

// DELETE personal skill
app.delete('/api/personal-skills/:id', authMiddleware, async (req, res) => {
  const skill = await get('SELECT user_id FROM personal_skills WHERE id = ?', [req.params.id]);
  if (!skill) return res.status(404).json({ error: 'Skill not found.' });
  if (skill.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied.' });
  
  await run('DELETE FROM personal_skills WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ==================== AI LEARNING ENDPOINTS ====================

app.post('/api/games/generate', authMiddleware, async (req, res) => {
  const { type } = req.body;
  
  try {
    let systemPrompt = "You are playing a game against a human. Be clever and fair.";
    let userPrompt = "";

    if (type === 'word-guess') {
      userPrompt = "Think of a single, interesting English word for a guessing game (5-10 letters). Return ONLY the word in uppercase. No punctuation.";
    } else if (type === 'math-duel') {
      userPrompt = "Generate a challenging but solvable mental math problem (addition, subtraction, or multiplication). Return ONLY the problem and answer in JSON format: {\"q\": \"expression\", \"a\": result}.";
    } else if (type === 'rps') {
      userPrompt = "Pick one: Rock, Paper, or Scissors. Return ONLY the word. Be unpredictable.";
    } else {
      return res.status(400).json({ error: 'Invalid game type' });
    }

    // Attempt to use the 'games' feature model configuration
    let config = null;
    const featureSetting = await getFeatureModel('games');
    if (featureSetting) {
      config = await resolveModelConfig(featureSetting.modelId);
    }

    let providerRow, modelId;
    if (config) {
      providerRow = {
        provider_type: config.provider.type,
        api_key: config.provider.apiKey,
        base_url: config.provider.baseUrl,
        name: config.provider.name
      };
      modelId = config.modelId;
    } else {
      // Fallback: OpenRouter meta-llama/llama-3-8b-instruct for games
      providerRow = {
        provider_type: 'openrouter',
        api_key: process.env.OPENROUTER_API_KEY || '',
        base_url: 'https://openrouter.ai/api/v1',
        name: 'OpenRouter'
      };
      modelId = 'meta-llama/llama-3-8b-instruct';
    }
                        
    if (!providerRow) throw new Error("No AI providers available");

    const handler = getProviderHandler(providerRow.provider_type);
    const aiResponse = await handler({
      providerRow,
      modelId: modelId,
      messages: [{ role: 'user', content: userPrompt }],
      customSystemPrompt: systemPrompt,
      // Increase timeout or allow unlimited for games thinking
      timeout: 0 
    });

    let thoughts = "";
    let rawResponse = aiResponse;
    const thinkMatch = rawResponse.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thoughts = thinkMatch[1].trim();
      rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    let result = rawResponse.trim();

    if (type === 'math-duel') {
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      } catch (e) {
        // Fallback
        result = { q: "12 * 4", a: 48 };
      }
    } else if (type === 'word-guess') {
       result = result.split(/\s+/)[0].replace(/[^A-Z]/gi, '').toUpperCase();
       if (!result) result = "ZYGAI";
    } else if (type === 'rps') {
       const choices = ['Rock', 'Paper', 'Scissors'];
       const found = choices.find(c => result.toLowerCase().includes(c.toLowerCase()));
       result = found || choices[Math.floor(Math.random() * 3)];
    }

    res.json({ result, thoughts });
  } catch (error) {
    console.error('Game Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/learning', authMiddleware, async (req, res) => {
  try {
    const materials = await all(
      'SELECT id, knowledge_id, type, title, created_at, updated_at FROM learning_materials WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ materials });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/learning/:id', authMiddleware, async (req, res) => {
  try {
    const material = await get(
      'SELECT * FROM learning_materials WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!material) return res.status(404).json({ error: 'Material not found' });
    
    if (typeof material.content === 'string') {
      try {
        material.content = JSON.parse(material.content);
      } catch (e) {}
    }
    
    res.json({ material });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/learning/generate', authMiddleware, async (req, res) => {
  const { knowledgeId, type, title } = req.body;
  if (!knowledgeId || !type || !title) {
    return res.status(400).json({ error: 'Missing knowledgeId, type, or title' });
  }

  try {
    const chunks = await all(
      'SELECT content FROM knowledge_chunks WHERE knowledge_id = ? ORDER BY chunk_index LIMIT 15',
      [knowledgeId]
    );
    if (chunks.length === 0) {
      return res.status(400).json({ error: 'No knowledge found in the selected base' });
    }
    const context = chunks.map(c => c.content).join('\n\n');

    let systemPrompt = '';
    if (type === 'flashcards') {
      systemPrompt = "Task: Generate 10-15 high-quality flashcards based on the provided context.\nFormat: Return ONLY a valid JSON array of objects. Each object MUST have 'question' and 'answer' strings.\nConstraint: No markdown code blocks, no preamble, no explanation. Just the raw JSON array.";
    } else if (type === 'quiz') {
      systemPrompt = "Task: Generate a multiple-choice quiz (5-10 questions) based on the provided context.\nFormat: Return ONLY a valid JSON array of objects. Each object MUST have 'question' (string), 'options' (array of 4 strings), and 'correctIndex' (number 0-3).\nConstraint: No markdown code blocks, no preamble, no explanation. Just the raw JSON array.";
    } else {
      return res.status(400).json({ error: 'Invalid learning type' });
    }

    const providerRow = {
      provider_type: 'openrouter',
      api_key: process.env.OPENROUTER_API_KEY || '',
      base_url: 'https://openrouter.ai/api/v1',
      name: 'OpenRouter'
    };

    const handler = getProviderHandler('openrouter');
    const aiResponse = await handler({
      providerRow,
      modelId: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: `CONTEXT:\n${context}\n\nINSTRUCTION: ${systemPrompt}` }],
      customSystemPrompt: "You are a specialized Educational AI. You output strictly valid JSON arrays for learning materials. Never include markdown formatting or conversational text."
    });

    let content;
    try {
      // Improved JSON extraction: find the first '[' and last ']'
      let cleanedResponse = aiResponse.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.includes('```')) {
        const blocks = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (blocks && blocks[1]) {
          cleanedResponse = blocks[1].trim();
        }
      }

      const firstBracket = cleanedResponse.indexOf('[');
      const lastBracket = cleanedResponse.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        cleanedResponse = cleanedResponse.substring(firstBracket, lastBracket + 1);
      }
      
      content = JSON.parse(cleanedResponse);
    } catch (err) {
      console.error('AI JSON Parse Error:', err, aiResponse);
      return res.status(500).json({ error: 'AI failed to generate valid learning material. Try again.' });
    }

    const id = createId();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
    await run(
      'INSERT INTO learning_materials (id, user_id, knowledge_id, type, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, knowledgeId, type, title, JSON.stringify(content), now, now]
    );

    res.json({ id, type, title, content, created_at: now, updated_at: now });
  } catch (error) {
    console.error('Learning Generation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/learning/:id', authMiddleware, async (req, res) => {
  try {
    const result = await run(
      'DELETE FROM learning_materials WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Material not found' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === MARKETPLACE ENDPOINTS ===

app.get('/api/marketplace/items', optionalAuthMiddleware, async (req, res) => {
  const siteSettings = await get('SELECT zygs_marketplace_public, prompts_marketplace_public FROM site_settings WHERE id = 1');
  const zygsPublic = siteSettings ? Boolean(siteSettings.zygs_marketplace_public) : true;
  const promptsPublic = siteSettings ? Boolean(siteSettings.prompts_marketplace_public) : true;

  const { type, sort = 'top', category, search, page = '1', authorId } = req.query;
  
  if (type === 'zyg' && !zygsPublic && req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Zyg's Marketplace is currently restricted to Admins." });
  }
  if (type === 'prompt' && !promptsPublic && req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Prompts Marketplace is currently restricted to Admins." });
  }

  const limit = 20;
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;
  let sql = `
    SELECT m.*, u.display_name as author_name 
    FROM marketplace_items m
    JOIN users u ON m.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (authorId) {
    sql += ' AND m.user_id = ?';
    params.push(authorId);
  }
  
  if (type === 'prompt' || type === 'zyg') {
    sql += ' AND m.item_type = ?';
    params.push(type);
  }
  
  if (category && category !== 'All') {
    sql += ' AND m.category = ?';
    params.push(category);
  }
  
  if (search && search.trim() !== '') {
    sql += ' AND (m.title LIKE ? OR m.description LIKE ?)';
    const wildcard = `%${search.trim()}%`;
    params.push(wildcard, wildcard);
  }
  
  if (sort === 'featured') {
    sql += ' ORDER BY m.is_featured DESC, (m.upvotes - m.downvotes) DESC, m.created_at DESC';
  } else if (sort === 'new') {
    sql += ' ORDER BY m.created_at DESC';
  } else {
    // Default: top voted
    sql += ' ORDER BY (m.upvotes - m.downvotes) DESC, m.created_at DESC';
  }
  
  sql += ` LIMIT ${limit + 1} OFFSET ${offset}`;
  
  const items = await all(sql, params);
  
  let hasMore = false;
  if (items.length > limit) {
    hasMore = true;
    items.pop();
  }

  // Automatically attach the current user's vote if they are logged in!
  if (req.user) {
    const userVotes = await all('SELECT item_id, vote_type FROM marketplace_votes WHERE user_id = ?', [req.user.id]);
    const voteMap = {};
    userVotes.forEach(v => voteMap[v.item_id] = v.vote_type);
    
    items.forEach(item => {
      item.user_vote = voteMap[item.id] || 0;
    });
  }
  
  res.json({ items, hasMore });
});

app.post('/api/marketplace/items', authMiddleware, async (req, res) => {
  const userRow = await get('SELECT banned_from_marketplace FROM users WHERE id = ?', [req.user.id]);
  if (userRow?.banned_from_marketplace) {
    return res.status(403).json({ error: 'You are banned from uploading to the marketplace.' });
  }

  const { type, title, description, content, category } = req.body;
  if (!['prompt', 'zyg'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Must be prompt or zyg.' });
  }
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content required.' });
  }

  const id = createId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  
  await run(
    `INSERT INTO marketplace_items (id, user_id, item_type, title, description, content, category, created_at, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, type, title.trim(), description?.trim() || '', content, category?.trim() || null, now, now]
  );
  
  res.json({ ok: true, id });
});

app.post('/api/marketplace/items/:id/vote', authMiddleware, async (req, res) => {
  const { vote } = req.body;
  const itemId = req.params.id;
  const userId = req.user.id;
  
  // 1 = upvote, -1 = downvote, 0 = remove vote
  if (![1, 0, -1].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote value.' });
  }
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  
  if (vote === 0) {
    await run('DELETE FROM marketplace_votes WHERE item_id = ? AND user_id = ?', [itemId, userId]);
  } else {
    await run(
      `INSERT INTO marketplace_votes (item_id, user_id, vote_type, created_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE vote_type = VALUES(vote_type)`,
      [itemId, userId, vote, now]
    );
  }
  
  // Automatically recalculate exact upvotes and downvotes
  const votes = await all('SELECT vote_type FROM marketplace_votes WHERE item_id = ?', [itemId]);
  let upvotes = 0;
  let downvotes = 0;
  votes.forEach(v => {
    if (v.vote_type === 1) upvotes++;
    if (v.vote_type === -1) downvotes++;
  });
  
  await run('UPDATE marketplace_items SET upvotes = ?, downvotes = ? WHERE id = ?', [upvotes, downvotes, itemId]);
  
  res.json({ ok: true, upvotes, downvotes });
});

app.put('/api/marketplace/items/:id', authMiddleware, async (req, res) => {
  const { title, description, content, category } = req.body;
  const item = await get('SELECT user_id FROM marketplace_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (item.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  await run(
    'UPDATE marketplace_items SET title = ?, description = ?, content = ?, category = ?, updated_at = ? WHERE id = ?',
    [title.trim(), description?.trim() || '', content, category?.trim() || null, now, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/marketplace/items/:id', authMiddleware, async (req, res) => {
  const item = await get('SELECT user_id FROM marketplace_items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  if (item.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  await run('DELETE FROM marketplace_items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/admin/marketplace/items/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM marketplace_items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.patch('/api/admin/marketplace/items/:id/feature', authMiddleware, async (req, res) => {
  const { is_featured } = req.body;
  await run('UPDATE marketplace_items SET is_featured = ? WHERE id = ?', [is_featured ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

app.get('/api/stripe/plans', (req, res) => {
  loadPlanSettings()
      .then((planSettings) => {
        const plans = [
          {
            id: 'free',
            name: 'ZygAI Free',
            price: 0,
            features: ['ZygAI Models only', 'Standard response time']
          }
        ];

        if (planSettings.find((p) => p.id === 'go')?.enabled) {
          plans.push({
            id: 'go',
            name: 'ZygAI Go',
            price: 7,
            features: ['Everything in Free', 'Access to all models', 'More messages', 'More uploads', 'More image gens', 'Bigger memory']
          });
        }

        if (planSettings.find((p) => p.id === 'plus')?.enabled) {
          plans.push({
            id: 'plus',
            name: 'ZygAI Plus',
            price: 15,
            features: ['Everything in Go', 'More models', 'More reasoning', 'More uploads/messages', 'More memory', 'More image gens', 'Pre-release functions']
          });
        }

        res.json({ plans });
      })
      .catch(() => {
        res.json({
          plans: [{ id: 'free', name: 'ZygAI Free', price: 0 }]
        });
      });
});

app.post('/api/stripe/create-checkout-session', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured.' });
  }
  const { plan } = req.body;
  if (!['go', 'plus'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  const planSettings = await loadPlanSettings();
  if (planSettings.find((p) => p.id === plan)?.enabled === false) {
    return res.status(403).json({ error: 'Selected plan is currently disabled.' });
  }

  const priceId = plan === 'plus' ? process.env.STRIPE_PRICE_ID_PLUS : process.env.STRIPE_PRICE_ID_GO;
  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  
  if (!priceId || !successUrl || !cancelUrl) {
    console.error('[Stripe] Missing environment variables for checkout.');
    return res.status(500).json({ error: 'Stripe pricing not configured.' });
  }

  // Ensure successUrl doesn't have a trailing slash before appending query params
  const baseSuccessUrl = successUrl.endsWith('/') ? successUrl.slice(0, -1) : successUrl;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: req.user.email,
      success_url: `${baseSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId: req.user.id,
          plan: plan
        }
      },
      metadata: {
        userId: req.user.id,
        plan: plan
      }
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('[Stripe] Failed to create checkout session:', error);
    res.status(500).json({ error: 'Failed to initiate checkout.' });
  }
});

app.post('/api/stripe/create-topup-session', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured.' });
  const { amount } = req.body; // Amount in USD, e.g. 5, 10, 20
  
  if (!amount || isNaN(amount) || amount < 5) {
    return res.status(400).json({ error: 'Minimum deposit is $5.00' });
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  const baseSuccessUrl = successUrl.endsWith('/') ? successUrl.slice(0, -1) : successUrl;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'ZygAI API Credits',
            description: `Top up your developer API balance with $${amount} worth of credits.`,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      }],
      customer_email: req.user.email,
      success_url: `${baseSuccessUrl}?session_id={CHECKOUT_SESSION_ID}&type=topup`,
      cancel_url: cancelUrl,
      metadata: {
        userId: req.user.id,
        type: 'topup',
        amount: amount.toString()
      }
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('[Stripe] Top-up session creation failed:', error);
    res.status(500).json({ error: 'Failed to initiate deposit.' });
  }
});

app.post('/api/stripe/cancel-subscription', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured.' });
  }

  try {
    const user = await get('SELECT stripe_subscription_id FROM users WHERE id = ?', [req.user.id]);
    if (!user?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription found.' });
    }

    await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    res.json({ ok: true, message: 'Subscription will be canceled at the end of the period.' });
  } catch (err) {
    console.error('Stripe cancellation error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to cancel subscription.' });
  }
});

app.post('/api/presence', authMiddleware, (req, res) => {
  try {
    updateOnlineUser(req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Presence update error:', error);
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

app.post('/api/pwa/install', optionalAuthMiddleware, async (req, res) => {
  const userId = req.user?.id || null;
  const userAgent = req.get('user-agent') || null;
  await run('INSERT INTO pwa_installs (user_id, user_agent, created_at) VALUES (?, ?, ?)', [
    userId,
    userAgent,
    new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')
  ]);
  res.json({ ok: true });
});

// Ad-supported model API routes

// Get public ad settings
app.get('/api/ads/settings', optionalAuthMiddleware, async (req, res) => {
  const planSettings = await loadPlanSettings();
  const adPlanEnabled = planSettings.find((plan) => plan.id === 'ad')?.enabled !== false;
  const settings = await get('SELECT * FROM site_settings WHERE id = 1');
  if (!settings) {
    return res.json({
      adsEnabled: adPlanEnabled,
      adPlanEnabled,
      adSessionDurationSeconds: 30,
      adCreditDurationMinutes: 15,
      adMaxSessionMinutes: 60,
      adRectangleCode: null,
      adOverlayCode: null
    });
  }
  return res.json({
    adsEnabled: Boolean(settings.ads_enabled) && adPlanEnabled,
    adPlanEnabled,
    adSessionDurationSeconds: settings.ad_session_duration_seconds,
    adCreditDurationMinutes: settings.ad_credit_duration_minutes,
    adMaxSessionMinutes: settings.ad_max_session_minutes,
    adRectangleCode: settings.ad_rectangle_code,
    adOverlayCode: settings.ad_overlay_code
  });
});

// Register an ad view (grants time credit)
app.post('/api/ads/register-view', authMiddleware, async (req, res) => {
  const { adType, adProvider } = req.body || {};
  if (!adType) {
    return res.status(400).json({ error: 'Ad type required.' });
  }
  const planSettings = await loadPlanSettings();
  const adPlanEnabled = planSettings.find((plan) => plan.id === 'ad')?.enabled !== false;
  if (!adPlanEnabled) {
    return res.status(403).json({ error: 'Ad plan is disabled.' });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const adTypeNormalized = adType === 'overlay' ? 'overlay' : 'rectangle';

  // Record the ad view
  await run(
      `INSERT INTO ad_sessions (user_id, ad_type, ad_provider, created_at) VALUES (?, ?, ?, ?)`,
      [req.user.id, adTypeNormalized, adProvider || null, now]
  );

  // Upgrade user to 'ad' plan if they are free
  if (req.user.plan === 'free') {
    await run("UPDATE users SET plan = 'ad' WHERE id = ?", [req.user.id]);
  }

  // Get current settings
  const settings = await get('SELECT * FROM site_settings WHERE id = 1');
  const creditMinutes = settings?.ad_credit_duration_minutes || 15;

  // Update user's time credits (add credit minutes)
  const currentCredits = await get(
      'SELECT * FROM user_time_credits WHERE user_id = ?',
      [req.user.id]
  );

  if (currentCredits) {
    const newRemaining = (currentCredits.remaining_seconds || 0) + (creditMinutes * 60);
    // Apply 1-hour cap
    const maxSeconds = (settings?.ad_max_session_minutes || 60) * 60;
    const cappedRemaining = Math.min(newRemaining, maxSeconds);
    await run(
        'UPDATE user_time_credits SET remaining_seconds = ?, last_updated = ? WHERE user_id = ?',
        [cappedRemaining, now, req.user.id]
    );
  } else {
    await run(
        'INSERT INTO user_time_credits (user_id, remaining_seconds, last_updated) VALUES (?, ?, ?)',
        [req.user.id, creditMinutes * 60, now]
    );
  }

  res.json({ ok: true, creditsAdded: creditMinutes });
});

// Switch from 'ad' plan to 'free' plan (opt out of ad-supported model)
app.post('/api/ads/switch-to-free', authMiddleware, async (req, res) => {
  if (req.user.plan !== 'ad') {
    return res.status(400).json({ error: 'Not on ad-supported plan.' });
  }

  await run("UPDATE users SET plan = 'free' WHERE id = ?", [req.user.id]);

  // Clear user's time credits
  await run('DELETE FROM user_time_credits WHERE user_id = ?', [req.user.id]);

  res.json({ ok: true, message: 'Switched to free plan. No more ads.' });
});

// Get public settings (Marketplace toggles, etc.)
app.get('/api/settings/public', async (req, res) => {
  const settings = await get('SELECT zygs_marketplace_public, prompts_marketplace_public, vibe_coder_public, reach_public, vibe_coder_model, reach_model FROM site_settings WHERE id = 1');
  res.json({
    zygsMarketplacePublic: settings ? Boolean(settings.zygs_marketplace_public) : true,
    promptsMarketplacePublic: settings ? Boolean(settings.prompts_marketplace_public) : true,
    vibeCoderPublic: settings ? Boolean(settings.vibe_coder_public) : false,
    reachPublic: settings ? Boolean(settings.reach_public) : false,
    vibeCoderModel: settings?.vibe_coder_model || 'gpt-4o',
    reachModel: settings?.reach_model || 'llama-3.1-8b-instruct',
    apiRatePer1M: settings?.api_rate_per_1m || 0.0500
  });
});

// Get user's remaining time credits
app.get('/api/user/time-credits', authMiddleware, async (req, res) => {
  const settings = await get('SELECT * FROM site_settings WHERE id = 1');
  
  // Plan-based limits
  const planLimits = {
    free: (settings?.ad_max_session_minutes || 120) * 60,  // Increased from 60 to 120 minutes
    go: (settings?.go_session_minutes || 600) * 60,        // Increased from 300 to 600 minutes
    plus: (settings?.plus_session_minutes || 1440) * 60,    // Increased from 720 to 1440 minutes
    beta: (settings?.beta_session_minutes || 2880) * 60     // Increased from 1440 to 2880 minutes
  };
  
  const maxSeconds = planLimits[req.user.plan] || planLimits.free;

  const credits = await get(
      'SELECT * FROM user_time_credits WHERE user_id = ?',
      [req.user.id]
  );

  // Admins get unlimited access
  if (req.user.role === 'admin') {
    return res.json({
      remainingSeconds: credits?.remaining_seconds || 0,
      maxSeconds,
      isUnlimited: true,
      plan: req.user.plan,
      resetTime: settings?.daily_reset_time || '23:00'
    });
  }

  // Plus and Go plans get their respective limits
  if (req.user.plan === 'plus' || req.user.plan === 'go' || req.user.plan === 'beta') {
    return res.json({
      remainingSeconds: credits?.remaining_seconds || maxSeconds,
      maxSeconds,
      isUnlimited: false,
      plan: req.user.plan,
      resetTime: settings?.daily_reset_time || '23:00'
    });
  }

  // Free plan
  return res.json({
    remainingSeconds: credits?.remaining_seconds || 0,
    maxSeconds,
    isUnlimited: false,
    plan: req.user.plan,
    resetTime: settings?.daily_reset_time || '23:00'
  });
});

// Save user's remaining time credits (called on logout)
app.post('/api/user/save-time-credits', authMiddleware, async (req, res) => {
  const { remainingSeconds } = req.body || {};

  if (typeof remainingSeconds !== 'number' || remainingSeconds < 0) {
    return res.status(400).json({ error: 'Invalid remaining seconds.' });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const settings = await get('SELECT * FROM site_settings WHERE id = 1');
  const maxSeconds = (settings?.ad_max_session_minutes || 60) * 60;
  const cappedSeconds = Math.min(remainingSeconds, maxSeconds);

  await run(
      `INSERT INTO user_time_credits (user_id, remaining_seconds, last_updated)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       remaining_seconds = VALUES(remaining_seconds),
       last_updated = VALUES(last_updated)`,
      [req.user.id, cappedSeconds, now]
  );

  res.json({ ok: true });
});

// Birthday Surprise Routes
app.post('/api/birthday/wish', authMiddleware, async (req, res) => {
  const ZYGA_EMAIL = 'zygai@zygai.app';
  if (req.user.email === ZYGA_EMAIL) {
    return res.status(403).json({ error: 'You cannot wish yourself a birthday wish!' });
  }

  const PROMO_END = new Date('2026-06-04T20:59:59Z').getTime();
  if (Date.now() > PROMO_END) {
    return res.status(403).json({ error: 'Birthday wish period has ended.' });
  }

  const { content } = req.body;
  if (!content || content.trim().length < 5) {
    return res.status(400).json({ error: 'Please write a meaningful wish (min 5 characters).' });
  }

  try {
    await run(
      'INSERT INTO birthday_wishes (user_id, content, created_at) VALUES (?, ?, ?)',
      [req.user.id, content.trim(), new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to save wish:', error);
    res.status(500).json({ error: 'Failed to save wish.' });
  }
});

app.get('/api/birthday/wishes', authMiddleware, async (req, res) => {
  const ZYGA_EMAIL = 'zygai@zygai.app';
  if (req.user.email !== ZYGA_EMAIL) {
    return res.status(403).json({ error: 'Only Zygiuos can see the wishes.' });
  }

  const REVEAL_DATE = new Date('2026-06-04T21:00:00Z').getTime();
  if (Date.now() < REVEAL_DATE) {
    return res.status(403).json({ error: 'No peeking! You can open your presents on June 5th.' });
  }

  try {
    const wishes = await all(`
      SELECT bw.*, u.display_name, u.email 
      FROM birthday_wishes bw 
      JOIN users u ON bw.user_id = u.id 
      ORDER BY bw.created_at DESC
    `);
    res.json({ wishes });
  } catch (error) {
    console.error('Failed to fetch wishes:', error);
    res.status(500).json({ error: 'Failed to fetch wishes.' });
  }
});

app.post('/api/birthday/award', authMiddleware, async (req, res) => {
  const ZYGA_EMAIL = 'zygai@zygai.app';
  if (req.user.email !== ZYGA_EMAIL) {
    return res.status(403).json({ error: 'Only Zygiuos can award plans.' });
  }

  const { wishId, plan } = req.body;
  if (!['go', 'plus'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan choice.' });
  }

  try {
    const wish = await get('SELECT user_id FROM birthday_wishes WHERE id = ?', [wishId]);
    if (!wish) return res.status(404).json({ error: 'Wish not found.' });

    await run('UPDATE users SET plan = ? WHERE id = ?', [plan, wish.user_id]);
    await run('UPDATE birthday_wishes SET awarded_plan = ? WHERE id = ?', [plan, wishId]);

    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to award plan:', error);
    res.status(500).json({ error: 'Failed to award plan.' });
  }
});

// Admin: Get site settings
app.get('/api/admin/site-settings', authMiddleware, async (req, res) => {
  const settings = await get('SELECT * FROM site_settings WHERE id = 1');
  res.json({
    adsEnabled: settings ? Boolean(settings.ads_enabled) : true,
    adRectangleCode: settings?.ad_rectangle_code || '',
    adOverlayCode: settings?.ad_overlay_code || '',
    adSessionDurationSeconds: settings?.ad_session_duration_seconds || 30,
    adCreditDurationMinutes: settings?.ad_credit_duration_minutes || 15,
    adMaxSessionMinutes: settings?.ad_max_session_minutes || 60,
    zygsMarketplacePublic: settings ? Boolean(settings.zygs_marketplace_public) : true,
    promptsMarketplacePublic: settings ? Boolean(settings.prompts_marketplace_public) : true,
    vibeCoderPublic: settings ? Boolean(settings.vibe_coder_public) : false,
    reachPublic: settings ? Boolean(settings.reach_public) : false,
    vibeCoderModel: settings?.vibe_coder_model || 'gpt-4o',
    reachModel: settings?.reach_model || 'llama-3.1-8b-instruct',
    apiRatePer1M: settings?.api_rate_per_1m || 0.0500
  });
});

// Admin: Update site settings
app.put('/api/admin/site-settings', authMiddleware, async (req, res) => {
   const {
     adsEnabled,
     adRectangleCode,
     adOverlayCode,
     adSessionDurationSeconds,
     adCreditDurationMinutes,
     adMaxSessionMinutes,
     zygsMarketplacePublic,
     promptsMarketplacePublic,
     vibeCoderPublic,
     reachPublic,
     vibeCoderModel,
     reachModel,
     apiRatePer1M,
     apiInputRatePer1M,
     apiOutputRatePer1M,
     apiCompactRate,
     apiToolRate
   } = req.body || {};

   const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
   const normalizedVibeCoderModel = typeof vibeCoderModel === 'string' ? vibeCoderModel.trim() : '';
   const normalizedReachModel = typeof reachModel === 'string' ? reachModel.trim() : '';
   await run(
       `INSERT INTO site_settings (id, ads_enabled, ad_rectangle_code, ad_overlay_code, ad_session_duration_seconds, ad_credit_duration_minutes, ad_max_session_minutes, zygs_marketplace_public, prompts_marketplace_public, vibe_coder_public, reach_public, vibe_coder_model, reach_model, api_rate_per_1m, api_input_rate_per_1m, api_output_rate_per_1m, api_compact_rate, api_tool_rate, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
         ads_enabled = VALUES(ads_enabled),
         ad_rectangle_code = VALUES(ad_rectangle_code),
         ad_overlay_code = VALUES(ad_overlay_code),
         ad_session_duration_seconds = VALUES(ad_session_duration_seconds),
         ad_credit_duration_minutes = VALUES(ad_credit_duration_minutes),
         ad_max_session_minutes = VALUES(ad_max_session_minutes),
         zygs_marketplace_public = VALUES(zygs_marketplace_public),
         prompts_marketplace_public = VALUES(prompts_marketplace_public),
         vibe_coder_public = VALUES(vibe_coder_public),
         reach_public = VALUES(reach_public),
         vibe_coder_model = VALUES(vibe_coder_model),
         reach_model = VALUES(reach_model),
         api_rate_per_1m = VALUES(api_rate_per_1m),
         api_input_rate_per_1m = VALUES(api_input_rate_per_1m),
         api_output_rate_per_1m = VALUES(api_output_rate_per_1m),
         api_compact_rate = VALUES(api_compact_rate),
         api_tool_rate = VALUES(api_tool_rate),
         updated_at = VALUES(updated_at)`,
     [
       adsEnabled ? 1 : 0,
       adRectangleCode || null,
       adOverlayCode || null,
       adSessionDurationSeconds || 30,
       adCreditDurationMinutes || 15,
       adMaxSessionMinutes || 60,
       zygsMarketplacePublic !== false ? 1 : 0,
       promptsMarketplacePublic !== false ? 1 : 0,
       vibeCoderPublic ? 1 : 0,
       reachPublic ? 1 : 0,
       normalizedVibeCoderModel || 'gpt-4o',
       normalizedReachModel || 'llama-3.1-8b-instruct',
       apiRatePer1M || 0.0500,
       apiInputRatePer1M || 0.0100,
       apiOutputRatePer1M || 0.0700,
       apiCompactRate || 0.0200,
       apiToolRate || 0.0200,
       now
     ]
   );

  res.json({ ok: true });
});

// Admin: Get plan settings
app.get('/api/admin/plan-settings', authMiddleware, async (req, res) => {
  const plans = await loadPlanSettings();
  res.json({ plans });
});

// Admin: Update plan settings
app.put('/api/admin/plan-settings', authMiddleware, async (req, res) => {
  const { plans } = req.body || {};
  if (!Array.isArray(plans)) {
    return res.status(400).json({ error: 'Plans payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const normalized = plans
      .map((plan) => ({
        id: typeof plan?.id === 'string' ? plan.id.trim() : '',
        enabled: plan?.enabled !== false
      }))
      .filter((plan) => plan.id.length > 0);

  await run('DELETE FROM plan_settings');
  for (const plan of normalized) {
    await run(
        `INSERT INTO plan_settings (id, enabled, updated_at) VALUES (?, ?, ?)`,
        [plan.id, plan.enabled ? 1 : 0, now]
    );
  }

  res.json({ ok: true, count: normalized.length });
});

// Admin: Get cluster nodes
app.get('/api/admin/cluster-nodes', authMiddleware, async (req, res) => {
  const nodes = await all(
      'SELECT id, name, base_url, display_name, model_id, priority, max_concurrent, enabled FROM ollama_cluster_nodes ORDER BY priority ASC'
  );
  const enriched = await Promise.all(
      nodes.map(async (node) => ({
        id: node.id,
        name: node.name || '',
        baseUrl: node.base_url,
        displayName: node.display_name || '',
        modelId: node.model_id || '',
        priority: node.priority,
        maxConcurrent: node.max_concurrent,
        enabled: node.enabled === 1,
        healthOk: await checkClusterHealth(node.base_url)
      }))
  );
  res.json({ nodes: enriched });
});

// Admin: Update cluster nodes
app.put('/api/admin/cluster-nodes', authMiddleware, async (req, res) => {
  const { nodes } = req.body || {};
  if (!Array.isArray(nodes)) {
    return res.status(400).json({ error: 'Nodes payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const normalized = nodes
      .map((node) => ({
        id: typeof node?.id === 'string' ? node.id.trim() : '',
        name: typeof node?.name === 'string' ? node.name.trim() : '',
        baseUrl: typeof node?.baseUrl === 'string' ? node.baseUrl.trim() : '',
        displayName: typeof node?.displayName === 'string' ? node.displayName.trim() : '',
        modelId: typeof node?.modelId === 'string' ? node.modelId.trim() : '',
        priority: Number.isFinite(node?.priority) ? Number(node.priority) : 1,
        maxConcurrent: Number.isFinite(node?.maxConcurrent) ? Number(node.maxConcurrent) : 1,
        enabled: node?.enabled !== false
      }))
      .filter((node) => node.id && node.baseUrl);

  await run('DELETE FROM ollama_cluster_nodes');
  for (const node of normalized) {
    await run(
        `INSERT INTO ollama_cluster_nodes (id, name, base_url, display_name, model_id, priority, max_concurrent, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.name || null,
          node.baseUrl,
          node.displayName || null,
          node.modelId || null,
          node.priority,
          node.maxConcurrent,
          node.enabled ? 1 : 0,
          now
        ]
    );
  }

  res.json({ ok: true, count: normalized.length });
});

// Admin: Get all MCP servers
app.get('/api/admin/mcp-servers', authMiddleware, async (req, res) => {
  const servers = await loadApiToolServers();
  res.json({ servers });
});

// User: Get their MCP servers (private + global)
app.get('/api/mcp-servers', authMiddleware, async (req, res) => {
  const servers = await loadApiToolServers(req.user.id);
  const enabledOnly = req.query.enabled === 'true';
  
  const filtered = servers
      .filter((server) => !enabledOnly || server.enabled)
      .map((server) => ({
        id: server.id,
        name: server.name,
        description: server.description,
        baseUrl: server.baseUrl,
        authHeader: server.authHeader,
        headers: Object.keys(server.headers || {}).length ? server.headers : undefined,
        userId: server.userId,
        isPublic: server.isPublic,
        enabled: server.enabled
      }));
  res.json({ servers: filtered });
});

// Community: Get public MCP servers
app.get('/api/community/mcp-servers', authMiddleware, async (req, res) => {
  const servers = await loadApiToolServers(null, true);
  const publicServers = servers
    .filter(s => s.isPublic || !s.userId) // Global or Public
    .map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      baseUrl: s.baseUrl,
      isPublic: s.isPublic,
      userId: s.userId
    }));
  res.json({ servers: publicServers });
});

// User: Import/Add MCP server (Private by default)
app.post('/api/mcp-servers/import', authMiddleware, async (req, res) => {
  const { command, config, description, isPublic, name: nameOverride } = req.body || {};
  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'Import configuration is required.' });
  }

  const input = command.trim();
  const id = createId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');

  let name = nameOverride || 'New MCP Server';
  let baseUrl = input;
  let mcpJsonUrl = null;
  let headers = {};
  let encryptedConfig = null;

  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    try {
      encryptedConfig = JSON.stringify(encryptMessage(config));
    } catch (error) {
      console.error('Failed to encrypt MCP config:', error.message);
    }
  }

  if (input.startsWith('http')) {
    try {
      const parsed = new URL(input);
      if (!nameOverride) name = parsed.hostname;
      if (input.endsWith('.json')) {
         mcpJsonUrl = input;
         try {
           const manifestResponse = await fetchWithTimeout(input, 5000);
           if (manifestResponse.ok) {
             const manifest = await manifestResponse.json().catch(() => null);
             const entry = manifest?.mcpServers && typeof manifest.mcpServers === 'object'
               ? Object.values(manifest.mcpServers).find((value) => value && typeof value === 'object')
               : null;
             if (entry && typeof entry === 'object') {
               if (!nameOverride) name = entry.name || entry.title || name;
               baseUrl = entry.url || entry.serverUrl || entry.baseUrl || baseUrl.replace(/\/[^/]+\.json$/, '/mcp');
               headers = entry.headers && typeof entry.headers === 'object' ? entry.headers : {};
             } else {
               baseUrl = input.replace(/\/[^/]+\.json$/, '/mcp');
             }
           }
         } catch {
           baseUrl = input.replace(/\/[^/]+\.json$/, '/mcp');
         }
      }
    } catch (e) {}
  } else if (!nameOverride) {
     name = input.split(' ').pop().split('/').pop() || 'New MCP Server';
  }

  await run(
    `INSERT INTO mcp_servers (id, name, description, base_url, headers_json, mcp_json_url, config_encrypted, enabled, user_id, is_public, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, 
      name, 
      description || null,
      baseUrl, 
      Object.keys(headers).length ? JSON.stringify(headers) : null, 
      mcpJsonUrl, 
      encryptedConfig, 
      1, 
      req.user.id,
      isPublic ? 1 : 0,
      now
    ]
  );

  res.status(201).json({ id, name, baseUrl, headers, mcpJsonUrl, enabled: true, userId: req.user.id, isPublic: !!isPublic });
});

// User: Toggle MCP server
app.patch('/api/mcp-servers/:id/toggle', authMiddleware, async (req, res) => {
  const { enabled } = req.body;
  const server = await get('SELECT user_id FROM mcp_servers WHERE id = ?', [req.params.id]);
  if (!server) return res.status(404).json({ error: 'Server not found.' });
  
  // Only owner or admin can toggle
  if (server.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  await run('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '), req.params.id]);
  res.json({ ok: true });
});

// User: Edit MCP server
app.put('/api/mcp-servers/:id', authMiddleware, async (req, res) => {
  const { name, baseUrl, authHeader, apiKey, headers, mcpJsonUrl, config, description, isPublic } = req.body;
  if (!name || !baseUrl) return res.status(400).json({ error: 'Name and Base URL required.' });
  
  const server = await get('SELECT user_id, config_encrypted FROM mcp_servers WHERE id = ?', [req.params.id]);
  if (!server) return res.status(404).json({ error: 'Server not found.' });

  // Only owner or admin can edit
  if (server.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  let encryptedConfig = null;
  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    try {
      encryptedConfig = JSON.stringify(encryptMessage(config));
    } catch (error) {
      console.error('Failed to encrypt MCP config:', error.message);
    }
  } else if (config === null) {
    encryptedConfig = null;
  } else {
    encryptedConfig = server.config_encrypted || null;
  }

  await run(
    'UPDATE mcp_servers SET name = ?, base_url = ?, auth_header = ?, api_key = ?, headers_json = ?, mcp_json_url = ?, config_encrypted = ?, description = ?, is_public = ?, updated_at = ? WHERE id = ?', 
    [
      name.trim(),
      baseUrl.trim(),
      authHeader ? String(authHeader).trim() : null,
      apiKey ? String(apiKey).trim() : null,
      headers && typeof headers === 'object' && Object.keys(headers).length ? JSON.stringify(headers) : null,
      mcpJsonUrl ? String(mcpJsonUrl).trim() : null,
      encryptedConfig,
      description || null,
      isPublic ? 1 : 0,
      new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' '),
      req.params.id
    ]
  );
  res.json({ ok: true });
});

// User: Delete MCP server
app.delete('/api/mcp-servers/:id', authMiddleware, async (req, res) => {
  const server = await get('SELECT user_id FROM mcp_servers WHERE id = ?', [req.params.id]);
  if (!server) return res.status(404).json({ error: 'Server not found.' });

  // Only owner or admin can delete
  if (server.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  await run('DELETE FROM mcp_servers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Admin: Get all MCP servers
app.get('/api/admin/mcp-servers', authMiddleware, async (req, res) => {
  const servers = await loadApiToolServers();
  res.json({ servers });
});

// User: Initiate Google OAuth for an MCP server
app.get('/api/mcp-servers/:id/google-auth', authMiddleware, async (req, res) => {
  const server = await get('SELECT * FROM mcp_servers WHERE id = ?', [req.params.id]);
  if (!server) return res.status(404).json({ error: 'Server not found.' });

  // Only owner or admin can initiate auth
  if (server.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(400).json({ error: 'Global Google Client ID not configured.' });

  const redirectUri = 'https://zygai.app';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive');
  const state = req.params.id;

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;

  res.json({ url: authUrl });
});

// User: Initiate Google Login
app.get('/api/auth/google/url', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(400).json({ error: 'Google Login not configured.' });

  const redirectUri = 'https://zygai.app';
  const scope = encodeURIComponent('openid email profile');
  const state = 'user_login';

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;

  res.json({ url: authUrl });
});

const handleGoogleOAuthCallback = async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(`Authentication error: ${error}`);
  if (!code || !state) return res.send('Missing code or state.');

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'https://zygai.app';

    const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', 10000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokens.error_description || tokens.error || 'Failed to exchange code for tokens.');

    if (state === 'user_login') {
      // User Authentication Flow
      const userRes = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', 5000, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const userInfo = await userRes.json();
      if (!userRes.ok) throw new Error('Failed to fetch user info from Google.');

      const email = userInfo.email.toLowerCase();
      let user = await get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        const userId = randomUUID();
        await run(
          'INSERT INTO users (id, email, display_name, email_verified, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, email, userInfo.name || userInfo.given_name, 1, 'user', new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
        );
        user = await get('SELECT * FROM users WHERE id = ?', [userId]);
      }

      const jwtToken = signToken({ id: user.id, email: user.email });
      await createSession(user.id, jwtToken, 'Google Login', 'unknown');

      // Send a script that saves the token to localStorage and redirects
      return res.send(`
        <script>
          localStorage.setItem('zygai:token', '${jwtToken}');
          window.location.href = '/';
        </script>
      `);
    } else {
      return res.send('<h1>Authentication Error</h1><p>Invalid state for login.</p>');
    }
  } catch (err) {
    console.error('Google OAuth Callback Error:', err);
    res.send(`<h1>Authentication Failed</h1><p>${err.message}</p>`);
  }
};

// Public callback for Google OAuth (Direct endpoint if configured in Console)
app.get('/api/mcp/google/callback', handleGoogleOAuthCallback);

// Catch Google redirects to the root URL (since it's the only URI in the official client secret)
app.get('/', (req, res, next) => {
  if (req.query.code && req.query.state) {
    return handleGoogleOAuthCallback(req, res);
  }
  next();
});

// --- Native MCP Implementations ---
const NATIVE_MCP_CONFIGS = {};

app.post('/api/mcp/:service/tools/call', authMiddleware, async (req, res) => {
  const { service } = req.params;
  const { method, params } = req.body;

  // Handshake
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: {
        protocolVersion: API_TOOL_PROTOCOL_VERSION,
        capabilities: {},
        serverInfo: { name: `Native ${service}`, version: '0.1.0' }
      }
    });
  }
  if (method === 'notifications/initialized') return res.status(204).send();
  if (method === 'tools/list') {
    const config = NATIVE_MCP_CONFIGS[service];
    if (!config) return res.status(404).json({ error: 'Service not found.' });
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: { tools: config.tools }
    });
  }

  // Tool Call Execution
  const { name: toolName, arguments: args } = params || {};
  const server = await get('SELECT * FROM mcp_servers WHERE id = ? OR name = ? OR base_url LIKE ?', [service, service, `%${service}%`]);
  if (!server || !server.config_encrypted) return res.status(401).json({ error: `${service} not connected.` });

  const config = decryptMessage(JSON.parse(server.config_encrypted).encrypted, JSON.parse(server.config_encrypted).iv, JSON.parse(server.config_encrypted).authTag);

  try {
    let result = null;

    // Native tool logic removed

    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mcp/:service/mcp.json', (req, res) => {
  const service = req.params.service;
  if (!NATIVE_MCP_CONFIGS[service]) return res.status(404).json({ error: 'Service not found.' });
  res.json({
    mcpServers: {
      [service]: {
        name: NATIVE_MCP_CONFIGS[service].name,
        url: `${API_BASE_URL}/api/mcp/${service}`
      }
    }
  });
});

// Admin: Delete MCP server
app.delete('/api/admin/mcp-servers/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM mcp_servers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Admin: Get feature model settings
app.get('/api/admin/feature-models', authMiddleware, async (req, res) => {
  const settings = await loadFeatureModelSettings();
  res.json({ settings });
});

// Admin: Update feature model settings
app.put('/api/admin/feature-models', authMiddleware, async (req, res) => {
  const { settings } = req.body || {};
  if (!Array.isArray(settings)) {
    return res.status(400).json({ error: 'Settings payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const normalized = settings
      .map((entry) => {
        const rawOptions = Array.isArray(entry?.modelOptions)
          ? entry.modelOptions
          : (Array.isArray(entry?.modelIds) ? entry.modelIds.map((id) => ({ provider: entry?.provider, modelId: id })) : []);
        const seenOptions = new Set();
        const modelOptions = rawOptions
          .map((option) => ({
            provider: typeof option?.provider === 'string' && option.provider.trim() ? option.provider.trim() : '',
            modelId: typeof option?.modelId === 'string' && option.modelId.trim()
              ? option.modelId.trim()
              : (typeof option === 'string' ? option.trim() : ''),
            label: typeof option?.label === 'string' && option.label.trim() ? option.label.trim() : undefined
          }))
          .filter((option) => {
            if (!option.provider || !option.modelId) return false;
            const key = `${option.provider}@@${option.modelId}`;
            if (seenOptions.has(key)) return false;
            seenOptions.add(key);
            return true;
          });
        const fallbackProvider = typeof entry?.provider === 'string' ? entry.provider.trim() : '';
        const fallbackModelId = typeof entry?.modelId === 'string' ? entry.modelId.trim() : '';
        const defaultOption = modelOptions.find((option) => option.modelId === fallbackModelId) ||
          (fallbackProvider && fallbackModelId ? { provider: fallbackProvider, modelId: fallbackModelId } : modelOptions[0]);
        const modelId = defaultOption?.modelId || '';
        const provider = defaultOption?.provider || fallbackProvider;
        const modelIds = modelOptions.length
          ? modelOptions.map((option) => option.modelId)
          : [];
        return {
          featureKey: typeof entry?.featureKey === 'string' ? entry.featureKey.trim() : '',
          provider,
          modelId,
          modelIds: modelIds.includes(modelId) ? modelIds : [modelId, ...modelIds].filter(Boolean),
          modelOptions: modelOptions.length ? modelOptions : (provider && modelId ? [{ provider, modelId }] : []),
          systemPrompt: typeof entry?.systemPrompt === 'string' ? entry.systemPrompt.trim() : ''
        };
      })
      .filter((entry) => entry.featureKey && entry.provider && entry.modelId);

  await run('DELETE FROM feature_model_settings');
  await run('DELETE FROM feature_model_options');
  for (const entry of normalized) {
    await run(
        `INSERT INTO feature_model_settings (feature_key, provider, model_id, system_prompt, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
        [entry.featureKey, entry.provider, entry.modelId, entry.systemPrompt || null, now]
    );
    if (entry.featureKey === 'vibe_coder') {
      for (const [position, option] of entry.modelOptions.entries()) {
        await run(
            `INSERT INTO feature_model_options (feature_key, provider, model_id, label, position, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              entry.featureKey,
              option.provider,
              option.modelId,
              option.label || null,
              position,
              now
            ]
        );
      }
    }
  }

  res.json({ ok: true, count: normalized.length });
});

// Admin: Get AI roles
app.get('/api/admin/ai-roles', authMiddleware, async (req, res) => {
  const roles = await all(
      'SELECT id, name, provider, model_id, system_prompt, enabled FROM ai_roles ORDER BY name ASC'
  );
  res.json({
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      provider: role.provider,
      modelId: role.model_id,
      systemPrompt: role.system_prompt || '',
      enabled: role.enabled === 1
    }))
  });
});

// Admin: Update AI roles
app.put('/api/admin/ai-roles', authMiddleware, async (req, res) => {
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) {
    return res.status(400).json({ error: 'Roles payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const normalized = roles
      .map((role) => ({
        id: typeof role?.id === 'string' ? role.id.trim() : '',
        name: typeof role?.name === 'string' ? role.name.trim() : '',
        provider: typeof role?.provider === 'string' ? role.provider.trim() : '',
        modelId: typeof role?.modelId === 'string' ? role.modelId.trim() : '',
        systemPrompt: typeof role?.systemPrompt === 'string' ? role.systemPrompt.trim() : '',
        enabled: role?.enabled !== false
      }))
      .filter((role) => role.id && role.name && role.provider && role.modelId);

  await run('DELETE FROM ai_roles');
  for (const role of normalized) {
    await run(
        `INSERT INTO ai_roles (id, name, provider, model_id, system_prompt, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          role.id,
          role.name,
          role.provider,
          role.modelId,
          role.systemPrompt || null,
          role.enabled ? 1 : 0,
          now
        ]
    );
  }

  res.json({ ok: true, count: normalized.length });
});

// Admin: Get prompts
app.get('/api/admin/prompts', authMiddleware, async (req, res) => {
  const prompts = await all(
      'SELECT id, title, body, enabled FROM prompts ORDER BY updated_at DESC'
  );
  res.json({
    prompts: prompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      body: prompt.body,
      enabled: prompt.enabled === 1
    }))
  });
});

// Admin: Update prompts
app.put('/api/admin/prompts', authMiddleware, async (req, res) => {
  const { prompts } = req.body || {};
  if (!Array.isArray(prompts)) {
    return res.status(400).json({ error: 'Prompts payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const normalized = prompts
      .map((prompt) => ({
        id: typeof prompt?.id === 'string' ? prompt.id.trim() : '',
        title: typeof prompt?.title === 'string' ? prompt.title.trim() : '',
        body: typeof prompt?.body === 'string' ? prompt.body.trim() : '',
        enabled: prompt?.enabled !== false
      }))
      .filter((prompt) => prompt.id && prompt.title && prompt.body);

  await run('DELETE FROM prompts');
  for (const prompt of normalized) {
    await run(
        `INSERT INTO prompts (id, title, body, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
        [prompt.id, prompt.title, prompt.body, prompt.enabled ? 1 : 0, now]
    );
  }

   res.json({ ok: true, count: normalized.length });
});

// Admin: Get Llama/Ollama settings
app.get('/api/admin/llama', authMiddleware, async (req, res) => {
  const settings = await get('SELECT * FROM llama_settings WHERE id = 1');
  res.json({
    baseUrl: settings?.base_url || '',
    modelId: settings?.model_id || '',
    name: settings?.name || '',
    enabled: settings?.enabled ?? true
  });
});

// Admin: Update Llama/Ollama settings
app.put('/api/admin/llama', authMiddleware, async (req, res) => {
  const { baseUrl, modelId, name, enabled } = req.body || {};
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');

  await run(
      `INSERT INTO llama_settings (id, base_url, model_id, name, enabled, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       base_url = VALUES(base_url),
       model_id = VALUES(model_id),
       name = VALUES(name),
       enabled = VALUES(enabled),
       updated_at = VALUES(updated_at)`,
      [baseUrl || null, modelId || null, name || null, enabled ? 1 : 0, now]
  );

  res.json({ ok: true, message: 'Llama settings saved' });
});

// Admin: List model catalog
app.get('/api/admin/models-catalog', authMiddleware, async (req, res) => {
  const catalog = await buildModelCatalog();
  res.json({ models: catalog });
});

// Admin: Update model catalog
app.put('/api/admin/models-catalog', authMiddleware, async (req, res) => {
  const { models } = req.body || {};
  if (!Array.isArray(models)) {
    return res.status(400).json({ error: 'Models payload must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const seen = new Set();
  const normalized = models
      .map((item) => ({
        id: typeof item?.id === 'string' ? item.id.trim() : '',
        provider: typeof item?.provider === 'string' ? item.provider.trim() : '',
        label: typeof item?.label === 'string' ? item.label.trim() : '',
        description: typeof item?.description === 'string' ? item.description.trim() : '',
        contextLength: typeof item?.contextLength === 'string' ? item.contextLength.trim() : '',
        pricing: typeof item?.pricing === 'string' ? item.pricing.trim() : '',
        speedHint: typeof item?.speedHint === 'string' ? item.speedHint.trim() : '',
        enabled: item?.enabled !== false
      }))
      .filter((item) => item.id.length > 0 && item.provider.length > 0)
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

  await run('DELETE FROM model_catalog');
  for (const item of normalized) {
    await run(
        `INSERT INTO model_catalog (id, provider, label, description, context_length, pricing, speed_hint, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.provider,
          item.label || null,
          item.description || null,
          item.contextLength || null,
          item.pricing || null,
          item.speedHint || null,
          item.enabled ? 1 : 0,
          now
        ]
    );
  }

  res.json({ ok: true, count: normalized.length });
});

// Proxy to Ollama (bypasses browser CORS and Mixed Content)
app.post('/api/admin/llama/models', authMiddleware, async (req, res) => {
  try {
    const { baseUrl } = req.body;
    if (!baseUrl) return res.status(400).json({ error: 'Base URL required' });

    // Server-side fetch to Ollama (bypasses browser CORS and Mixed Content)
    const response = await fetch(`${baseUrl}/v1/models`);

    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Ollama proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to connect to Ollama' });
  }
});

const WORKER_URL = process.env.SANDBOX_WORKER_URL || 'http://100.107.181.80:3000';

app.post('/api/sandbox/execute', optionalAuthMiddleware, async (req, res) => {
  try {
    const { code, language } = req.body;

    const workerResponse = await fetch(`${WORKER_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language }),
      signal: AbortSignal.timeout(300000)
    });

    const data = await workerResponse.json();

    if (!workerResponse.ok) {
      return res.status(workerResponse.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error('Failed to communicate with Sandbox Worker:', error);
    return res.status(500).json({ error: 'Sandbox worker is unreachable. Ensure the Tailscale connection is active.' });
  }
});

// Admin: Get ad statistics
app.get('/api/admin/ads/stats', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ').slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const todayStats = await get(
      `SELECT COUNT(*) as count FROM ad_sessions WHERE created_at LIKE ?`,
      [`${today}%`]
  );

  const weekStats = await get(
      `SELECT COUNT(*) as count FROM ad_sessions WHERE created_at >= ?`,
      [weekAgo]
  );

  const byDay = await all(
      `SELECT SUBSTRING(created_at, 1, 10) as day, COUNT(*) as count
     FROM ad_sessions
     GROUP BY day
     ORDER BY day DESC LIMIT 7`
  );

  res.json({
    todayViews: todayStats?.count || 0,
    weekViews: weekStats?.count || 0,
    byDay: byDay.reverse()
  });
});

app.get('/api/search', authMiddleware, async (req, res) => {
  const query = req.query.q;
   if (!query || typeof query !== 'string') {
     return res.status(400).json({ error: 'Missing query.' });
   }
   try {
     let results, images;

     // Use Exa for search
     if (!EXA_API_KEY) {
       return res.status(503).json({ 
         error: 'No search provider configured.',
         details: 'Configure EXA_API_KEY for web search'
       });
     }

     [results, images] = await Promise.all([callExa(query), callExaImages(query)]);
      return res.json({ 
        results, 
        images, 
        source: 'exa'
      });
   } catch (error) {
     const message = error instanceof Error ? error.message : 'Search failed.';
     return res.status(500).json({ error: message });
   }
});

app.post(
    '/api/parse-document',
    authMiddleware,
    express.json({ limit: '10mb' }),
    async (req, res) => {
      console.log(`[parse-document] Request received`);
      const { fileName, mimeType, file } = req.body || {};
      console.log(`[parse-document] fileName=${fileName}, mimeType=${mimeType}, fileLength=${file?.length}`);
      if (!file || typeof file !== 'string') {
        console.log(`[parse-document] Missing file data`);
        return res.status(400).json({ error: 'file data is required.' });
      }
      let buffer;
      try {
        buffer = Buffer.from(file, 'base64');
        console.log(`[parse-document] Buffer created, length=${buffer.length}`);
      } catch (error) {
        console.error(`[parse-document] Failed to create buffer:`, error);
        return res.status(400).json({ error: 'Invalid file data: not valid base64.' });
      }
      if (buffer.length > MAX_PARSE_BYTES) {
        return res.status(413).json({ error: `File is too large. Maximum size is ${MAX_PARSE_BYTES / 1024 / 1024}MB.` });
      }
      if (buffer.length === 0) {
        return res.status(400).json({ error: 'File is empty.' });
      }

      // Determine file type for fallback decisions
      const normalizedName = (fileName || '').toLowerCase();
      const isPdf = mimeType === 'application/pdf' || normalizedName.endsWith('.pdf');

      // Use Cloudflare Workers AI markdown conversion if configured
      if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
        console.log(`[parse-document] Calling convertToMarkdown`);
        try {
          const result = await convertToMarkdown(buffer, fileName, mimeType);
          console.log(`[parse-document] convertToMarkdown returned`);
          return res.json({ text: result.text.trim() });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cloudflare conversion failed.';
          console.error(`[CloudflareMarkdown] fileName=${fileName}, mimeType=${mimeType}, size=${buffer?.length}, error:`, message);
          // Fallback to PDF parsing only when Cloudflare fails
          if (isPdf) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Falling back to PDF parsing...');
            }
            // continue to legacy PDF parser below
          } else {
            // Non-PDF files require Cloudflare to work
            return res.status(500).json({
              error: 'Failed to convert document.',
              ...(process.env.NODE_ENV === 'development' && { debug: message })
            });
          }
        }
      }

      // Legacy PDF parsing fallback only
      if (isPdf) {
        try {
          const text = await extractTextFromPdf(buffer, fileName);
          return res.json({ text: (text || '').trim() });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to parse document.';
          console.error(`[DocumentParse] fileName=${fileName}, mimeType=${mimeType}, size=${buffer?.length}, error:`, message, error.originalError || '');
          return res.status(500).json({
            error: 'Failed to parse document.',
            ...(process.env.NODE_ENV === 'development' && { debug: message })
          });
        }
      }

      // Unsupported file type (Cloudflare not configured or non-PDF)
      return res.status(400).json({ 
        error: `Unsupported file type: ${mimeType || fileName ? fileName : 'unknown'}.` 
      });
    }
);

// Announcement endpoints
// Admin: Get API providers
app.get('/api/admin/api-providers', authMiddleware, async (req, res) => {
  const rows = await all('SELECT * FROM api_providers ORDER BY name ASC');
  res.json({
    providers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      apiKey: r.api_key,
      baseUrl: r.base_url,
      enabled: r.enabled === 1,
      providerType: r.provider_type || null,
      isHealthy: r.is_healthy === 1,
      failoverProviderId: r.failover_provider_id || null
    }))
  });
});

// Admin: Update API providers
app.put('/api/admin/api-providers', authMiddleware, async (req, res) => {
  const { providers } = req.body || {};
  if (!Array.isArray(providers)) {
    return res.status(400).json({ error: 'Providers must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  await run('DELETE FROM api_providers');
  for (const p of providers) {
    if (!p.name) continue;
    await run(
        `INSERT INTO api_providers (id, name, api_key, base_url, provider_type, enabled, failover_provider_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.name,
          p.apiKey || null,
          p.baseUrl || null,
          p.providerType || null,
          p.enabled ? 1 : 0,
          p.failoverProviderId || null,
          now
        ]
    );
  }
  res.json({ ok: true });
});

// Admin: Get model configs
 app.get('/api/admin/model-configs', authMiddleware, async (req, res) => {
   const rows = await all('SELECT * FROM model_configs ORDER BY name ASC');
    res.json({
      configs: rows.map((r) => ({
        id: r.id,
        name: r.name,
        providerId: r.provider_id,
        modelId: r.model_id,
        description: r.description || '',
        category: r.category || '8k',
        freeLimit: r.free_limit,
        paidLimit: r.paid_limit,
        goLimit: r.go_limit,
        plusLimit: r.plus_limit,
        betaLimit: r.beta_limit,
        role: r.role,
        planAccess: parsePlanAccess(r.plan_access || ''),
        enabled: r.enabled === 1,
        hiddenFromChat: r.hidden_from_chat === 1,
        supportsVision: r.supports_vision === 1,
        systemPrompt: r.system_prompt || ''
      }))
    });
 });

 // Admin: Update model configs
 app.put('/api/admin/model-configs', authMiddleware, async (req, res) => {
   const { configs } = req.body || {};
   if (!Array.isArray(configs)) {
     return res.status(400).json({ error: 'Configs must be an array.' });
   }
   const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
   await run('DELETE FROM model_configs');
   for (const c of configs) {
     if (!c.name || !c.providerId || !c.modelId) continue;
      await run(
          `INSERT INTO model_configs (id, name, provider_id, model_id, description, category, free_limit, paid_limit, go_limit, plus_limit, beta_limit, plan_access, role, enabled, hidden_from_chat, supports_vision, system_prompt, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.name,
            c.providerId,
            c.modelId,
            c.description || null,
            c.category || '8k',
            c.freeLimit || 0,
            c.paidLimit || 0,
            c.goLimit || 0,
            c.plusLimit || 0,
            c.betaLimit || 0,
            (Array.isArray(c.planAccess) && c.planAccess.length > 0 ? c.planAccess.join(',') : PLAN_IDS.join(',')),
            c.role || 'all',
            c.enabled ? 1 : 0,
            c.hiddenFromChat ? 1 : 0,
            c.supportsVision ? 1 : 0,
            c.systemPrompt || null,
            now
          ]
      );
   }
   res.json({ ok: true });
 });

// Admin: Get all campaigns
app.get('/api/admin/campaigns', authMiddleware, async (req, res) => {
  const campaigns = await all(
    'SELECT id, name, description, feature_key, duration_days, quota_limit, is_active, created_at, updated_at FROM campaigns ORDER BY created_at DESC'
  );
  res.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      featureKey: c.feature_key,
      durationDays: c.duration_days,
      quotaLimit: c.quota_limit,
      isActive: c.is_active === 1,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }))
  });
});

// Admin: Create/update campaign
app.put('/api/admin/campaigns', authMiddleware, async (req, res) => {
  const { campaigns } = req.body || {};
  if (!Array.isArray(campaigns)) {
    return res.status(400).json({ error: 'Campaigns must be an array.' });
  }
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');

  for (const c of campaigns) {
    if (!c.id) {
      // Create new campaign
      const id = randomUUID();
      await run(
        `INSERT INTO campaigns (id, name, description, feature_key, duration_days, quota_limit, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          c.name || 'New Campaign',
          c.description || '',
          c.featureKey || 'chat',
          c.durationDays || 30,
          c.quotaLimit || 100,
          c.isActive ? 1 : 0,
          now,
          now
        ]
      );
    } else {
      // Update existing campaign
      await run(
        `UPDATE campaigns SET name = ?, description = ?, feature_key = ?, duration_days = ?, quota_limit = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
        [
          c.name || 'New Campaign',
          c.description || '',
          c.featureKey || 'chat',
          c.durationDays || 30,
          c.quotaLimit || 100,
          c.isActive ? 1 : 0,
          now,
          c.id
        ]
      );
    }
  }

  res.json({ ok: true });
});

// Admin: Delete campaign
app.delete('/api/admin/campaigns/:id', authMiddleware, async (req, res) => {
  await run('DELETE FROM user_campaigns WHERE campaign_id = ?', [req.params.id]);
  await run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Admin: Assign campaign to user
app.post('/api/admin/campaigns/:id/assign', authMiddleware, async (req, res) => {
  const { userEmail } = req.body || {};
  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required.' });
  }

  // Find user by email
  const user = await get('SELECT id, plan FROM users WHERE email = ?', [userEmail]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Get campaign details
  const campaign = await get(
    'SELECT id, feature_key, quota_limit, duration_days FROM campaigns WHERE id = ? AND is_active = 1',
    [req.params.id]
  );
  if (!campaign) {
    return res.status(404).json({ error: 'Active campaign not found.' });
  }

  // Calculate expiration date
  const startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ');
  const expiresAt = new Date(Date.now() + campaign.duration_days * 24 * 60 * 60 * 1000).toISOString();

  // Create user campaign record
  const userCampaignId = randomUUID();
  await run(
    `INSERT INTO user_campaigns (id, user_id, campaign_id, quota_limit, quota_used, started_at, expires_at, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
    [
      userCampaignId,
      user.id,
      campaign.id,
      campaign.quota_limit,
      startedAt,
      expiresAt,
      startedAt,
      startedAt
    ]
  );

  res.json({ ok: true, userCampaignId });
});

// Get user's active campaigns
app.get('/api/user/campaigns', authMiddleware, async (req, res) => {
  const userCampaigns = await all(
    `SELECT uc.id, c.name, c.description, c.feature_key, uc.quota_limit, uc.quota_used, uc.started_at, uc.expires_at
     FROM user_campaigns uc
     JOIN campaigns c ON uc.campaign_id = c.id
     WHERE uc.user_id = ? AND uc.is_active = 1 AND uc.expires_at > ?
     ORDER BY uc.started_at DESC`,
    [req.user.id, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
  );

  res.json({
    campaigns: userCampaigns.map((uc) => ({
      id: uc.id,
      name: uc.name,
      description: uc.description,
      featureKey: uc.feature_key,
      quotaLimit: uc.quota_limit,
      quotaUsed: uc.quota_used,
      startedAt: uc.started_at,
      expiresAt: uc.expires_at
    }))
  });
});

app.use('/api', apiRouter); // Mount the API router

// ZygAI Reach Routes
setupReachRoutes(app, authMiddleware);

app.get('/manifest.webmanifest', (req, res, next) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, '..', 'dist', 'manifest.webmanifest'));
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = process.env.PORT || 8085;
const server = http.createServer(app);

// WebSocket server for chat streaming
const wss = new WebSocketServer({ server, path: '/api/chat/ws' });

const VIBE_CODER_SYSTEM_PROMPT = `You are Vibe Coder, a world-class AI software engineer and rapid prototyper.
Your goal is to help the user build lively, interactive visual experiences, responsive web apps, and complex data visualizations.
The user will provide natural language prompts focusing on the "vibe" or desired outcome rather than exact syntax.

Core Tenets:
1. Focus on creative intent and delivering functional, complete prototypes.
2. Write clean, modern, and well-documented code.
3. When providing code, ALWAYS use Markdown code blocks. If you generate HTML/JS/CSS, provide it as a single cohesive file where possible (e.g., using an HTML file with inline <style> and <script>), so it can be rendered perfectly in a live preview.
4. Assume the user doesn't want to deal with boilerplate. Give them code they can run instantly.
5. Your generated code will be automatically tested in a sandbox. Write bug-free, working code that executes immediately.
`;

const VIBE_CODER_SYSTEM_PROMPT_WITH_TOOLS = `You are Vibe Coder, a world-class AI software engineer and rapid prototyper.
Your goal is to help the user build lively, interactive visual experiences, responsive web apps, and complex data visualizations.
The user will provide natural language prompts focusing on the "vibe" or desired outcome rather than exact syntax.

Core Tenets:
1. Focus on creative intent and delivering functional, complete prototypes.
2. Write clean, modern, and well-documented code.
3. When providing code, ALWAYS use Markdown code blocks. If you generate HTML/JS/CSS, provide it as a single cohesive file where possible (e.g., using an HTML file with inline <style> and <script>), so it can be rendered perfectly in a live preview.
4. Assume the user doesn't want to deal with boilerplate. Give them code they can run instantly.
5. You have access to an execute_code tool. ALWAYS test your Python or JavaScript logic in the sandbox. Fix any errors you find before presenting the final code to the user!
6. CRITICAL: You are authorized to access the user's connected apps via MCP tools. When asked to perform a task involving these services, you MUST use the appropriate tools. You have been granted full permission by the user.
`;

wss.on('connection', async (ws, req) => {
  console.log('[WebSocket] New connection');
  
  // Extract token from query string
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const isVibe = url.searchParams.get('vibe') === 'true';
  
  if (!token) {
    ws.send(JSON.stringify({ type: 'error', error: 'Missing auth token' }));
    ws.close();
    return;
  }
  
  // Verify token
  let user;
  try {
    const decoded = verifyToken(token);
    const userRow = await get(
      'SELECT id, email, display_name, plan, role, email_verified, ai_role_id, two_factor_enabled FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!userRow) throw new Error('User not found');
    if (!userRow.email_verified) throw new Error('Email not verified');
    
    const role = isAdminEmail(userRow.email) ? 'admin' : userRow.role || 'user';
    user = {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name || null,
      plan: userRow.plan,
      role,
      emailVerified: Boolean(userRow.email_verified),
      aiRoleId: userRow.ai_role_id || null,
      twoFactorEnabled: Boolean(userRow.two_factor_enabled)
    };
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', error: 'Invalid or expired token' }));
    ws.close();
    return;
  }
  
  if (isVibe) {
    console.log('[VibeCoder WS] New connection authenticated');
    
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        const { messages, useRag, model } = msg;

        if (!messages || !Array.isArray(messages)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Messages array is required.' }));
          return;
        }

        const vibeQuota = await enforcePlanQuota(user, 'vibe_coder');
        if (!vibeQuota.ok) {
          ws.send(JSON.stringify({ type: 'error', ...buildPlanQuotaError(vibeQuota) }));
          return;
        }

        let additionalContext = '';

        if (useRag) {
          try {
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();
            if (lastUserMessage) {
              const ragServerUrl = process.env.RAG_SERVER_URL || 'http://100.114.102.61:3001';
              const ragResponse = await fetch(`${ragServerUrl}/api/rag/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: lastUserMessage.content, topK: 5 })
              });

              if (ragResponse.ok) {
                const ragData = await ragResponse.json();
                const retrievedContext = Array.isArray(ragData.results) 
                  ? ragData.results.map(r => r.content || r.text).join('\n\n')
                  : ragData.context || '';
                  
                if (retrievedContext) {
                  additionalContext = `\n\n### Codebase Context (from RAG):\nUse the following project context to inform your code generation, matching the project's style and existing utilities:\n${retrievedContext}\n`;
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch context from RAG server:', err);
          }
        }

        const parseVibeModelSelection = (value) => {
          if (!value || typeof value !== 'string') return { provider: '', modelId: '' };
          const separator = '@@';
          if (!value.includes(separator)) return { provider: '', modelId: value };
          const [provider, ...modelParts] = value.split(separator);
          return { provider, modelId: modelParts.join(separator) };
        };

        // Determine effective provider/model from admin-configured Vibe Coder options.
        const requestedSelection = parseVibeModelSelection(model);
        let effectiveProvider = requestedSelection.provider;
        let effectiveModel = requestedSelection.modelId;
        try {
          const featureModel = await getFeatureModel('vibe_coder');
          const allowedOptions = Array.isArray(featureModel?.modelOptions) && featureModel.modelOptions.length
            ? featureModel.modelOptions
            : (featureModel?.modelId ? [{ provider: featureModel.provider || 'zygai-ollama', modelId: featureModel.modelId }] : []);
          let selectedOption = null;
          if (effectiveModel) {
            selectedOption = allowedOptions.find((option) =>
              option.modelId === effectiveModel && (!effectiveProvider || option.provider === effectiveProvider)
            );
          } else {
            selectedOption = allowedOptions.find((option) => option.modelId === featureModel?.modelId) || allowedOptions[0] || null;
          }
          if (effectiveModel && allowedOptions.length && !selectedOption) {
            ws.send(JSON.stringify({ type: 'error', error: 'This Vibe Coder model is not enabled by an admin.' }));
            return;
          }
          if (selectedOption) {
            effectiveProvider = selectedOption.provider || featureModel?.provider || effectiveProvider;
            effectiveModel = selectedOption.modelId;
          }
        } catch (e) {
          console.warn('[VibeCoder] Failed to load feature model config:', e);
        }
        if (!effectiveModel) {
          effectiveModel = process.env.VIBE_CODER_MODEL || 'gemma4:e4b';
        }
        if (!effectiveProvider) {
          effectiveProvider = effectiveModel.includes(':') ? 'zygai-ollama' : 'openrouter';
        }

        // Enforce per-model daily limits (if configured)
        try {
          const limitRes = await checkModelLimit(user.id, user.plan || 'free', effectiveModel, 'vibe_coder');
          if (!limitRes.allowed) {
            ws.send(JSON.stringify({ type: 'error', error: 'Daily limit reached for this model. You have used ' + limitRes.used + '/' + limitRes.limit + ' messages today.' }));
            return;
          }
        } catch (e) {
          console.warn('[VibeCoder] Model limit check failed:', e);
        }

        const selectedModel = effectiveModel;
        const selectedProvider = effectiveProvider.toLowerCase();
        const isOllamaModel = selectedProvider === 'zygai-ollama' || (selectedModel && selectedModel.includes(':'));
        const basePrompt = isOllamaModel ? VIBE_CODER_SYSTEM_PROMPT : VIBE_CODER_SYSTEM_PROMPT_WITH_TOOLS;
        const systemPromptStr = basePrompt + additionalContext;

        const streamHandler = getStreamProviderHandler(selectedProvider);
        if (!streamHandler) {
          ws.send(JSON.stringify({ type: 'error', error: `Vibe Coder provider ${selectedProvider} is not supported.` }));
          return;
        }

        const providerRow = selectedProvider === 'zygai-ollama'
          ? await get("SELECT * FROM api_providers WHERE LOWER(name) IN ('zygai-ollama', 'zygai ollama') OR provider_type = 'zygai-ollama' LIMIT 1")
          : await get('SELECT * FROM api_providers WHERE (LOWER(name) = ? OR provider_type = ?) AND enabled = 1 LIMIT 1', [selectedProvider, selectedProvider]);
        if (selectedProvider !== 'zygai-ollama' && !providerRow) {
          ws.send(JSON.stringify({ type: 'error', error: `Provider ${selectedProvider} is not configured or enabled in the admin dashboard.` }));
          return;
        }
        const vibeCoderProviderRow = selectedProvider === 'zygai-ollama'
          ? {
            ...(providerRow || {}),
            base_url: process.env.VIBE_CODER_OLLAMA_BASE_URL || process.env.ZYGAI_OLLAMA_BASE_URL || providerRow?.base_url || 'http://100.115.210.53:11434',
            provider_type: 'zygai-ollama'
          }
          : {
            ...(providerRow || {}),
            provider_type: selectedProvider
          };
        console.info('[VibeCoder WS] Using provider', {
          provider: selectedProvider,
          baseUrl: vibeCoderProviderRow.base_url,
          model: selectedModel
        });

        let currentMessages = [...messages];
        let isFinished = false;
        let loopCount = 0;
        let fullContentAcc = '';

        while (!isFinished && loopCount < 5) {
          loopCount++;
          let stepContentAcc = '';
          let stepToolCalls = [];
          
          // Disable tool calling for Ollama models - use auto-execution instead
          const tools = isOllamaModel ? undefined : [
            {
              type: "function",
              function: {
                name: "execute_code",
                description: "Execute Python or JavaScript code in a secure sandbox and return the console output. Use this to test your code and fix errors before returning the final solution to the user.",
                parameters: {
                  type: "object",
                  properties: {
                    code: { type: "string", description: "The code to execute. Can be a full script." },
                    language: { type: "string", enum: ["python", "javascript"], description: "The programming language." }
                  },
                  required: ["code", "language"]
                }
              }
            }
          ];

          try {
            const stream = streamHandler({
              providerRow: vibeCoderProviderRow,
              modelId: selectedModel,
              messages: currentMessages,
              customSystemPrompt: systemPromptStr,
              ...(tools && { tools })
            });

            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                stepContentAcc += delta.content;
                fullContentAcc += delta.content;
                ws.send(JSON.stringify({ type: 'chunk', content: delta.content }));
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index !== undefined ? tc.index : 0;
                  if (!stepToolCalls[idx]) {
                    stepToolCalls[idx] = {
                      id: tc.id || '',
                      type: tc.type || 'function',
                      function: { name: '', arguments: '' }
                    };
                  }
                  if (tc.id) stepToolCalls[idx].id = tc.id;
                  if (tc.type) stepToolCalls[idx].type = tc.type;
                  if (tc.function?.name) {
                    stepToolCalls[idx].function.name += tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    stepToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          } catch (err) {
             throw new Error(`AI request failed: ${err.message}`);
          }

          stepToolCalls = stepToolCalls.filter(Boolean);

          if (stepToolCalls.length > 0) {
            // Ensure all tool calls have required fields before sending back to API
            for (const tc of stepToolCalls) {
              if (!tc.id) tc.id = `call_${Math.random().toString(36).substring(2, 10)}`;
              if (!tc.type) tc.type = 'function';
              if (!tc.function.name) tc.function.name = 'execute_code';
            }
            currentMessages.push({ role: 'assistant', content: stepContentAcc || null, tool_calls: stepToolCalls });
            ws.send(JSON.stringify({ type: 'chunk', content: '\n\n*> 🛠️ Vibe Coder is testing the code in the Sandbox...*\n\n' }));

            for (const tc of stepToolCalls) {
              if (tc.type === 'function' && tc.function.name === 'execute_code') {
                try {
                  const args = JSON.parse(tc.function.arguments);
                  const workerResponse = await fetch(`${WORKER_URL}/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: args.code, language: args.language }),
                    signal: AbortSignal.timeout(300000)
                  });
                  
                  const data = await workerResponse.json();
                  const output = workerResponse.ok ? data.output : data.error;
                  
                  currentMessages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name || 'execute_code', content: output || 'Execution successful. No output.' });
                  ws.send(JSON.stringify({ type: 'chunk', content: `*> 🟢 Sandbox Output:*\n\`\`\`text\n${String(output).trim()}\n\`\`\`\n\n` }));
                } catch (err) {
                  currentMessages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name || 'execute_code', content: `Sandbox Error: ${err.message}` });
                  ws.send(JSON.stringify({ type: 'chunk', content: `*> 🔴 Sandbox Error: Execution timed out or failed (${err.message})*\n\n` }));
                }
              }
            }
          } else {
            isFinished = true;
          }
        }
        
        if (loopCount >= 5 && !isFinished) {
          ws.send(JSON.stringify({ type: 'chunk', content: '\n\n*> ⚠️ Sandbox execution limit reached. Returning best attempt.*' }));
        }

        // Auto-execute generated code blocks without tool calling support
        if (isFinished && fullContentAcc) {
          const codeBlockRegex = /```(javascript|js|python|py|html|css)\n([\s\S]*?)```/g;
          const matches = Array.from(fullContentAcc.matchAll(codeBlockRegex));
          
          if (matches.length > 0) {
            ws.send(JSON.stringify({ type: 'chunk', content: '\n\n*> 🛠️ Vibe Coder is testing the generated code...*\n\n' }));
            
            for (const match of matches) {
              const lang = match[1].toLowerCase();
              const code = match[2];
              const language = ['js', 'javascript'].includes(lang) ? 'javascript' : ['py', 'python'].includes(lang) ? 'python' : ['css'].includes(lang) ? 'css' : 'html';
              
              try {
                const workerResponse = await fetch(`${WORKER_URL}/execute`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code, language }),
                  signal: AbortSignal.timeout(300000)
                });
                
                const data = await workerResponse.json();
                const output = workerResponse.ok ? data.output : data.error;
                
                ws.send(JSON.stringify({ 
                  type: 'chunk', 
                  content: `*> 🟢 ${language.charAt(0).toUpperCase() + language.slice(1)} Code Tested:*\n\`\`\`text\n${String(output || 'Code executed successfully').trim()}\n\`\`\`\n\n` 
                }));
              } catch (err) {
                ws.send(JSON.stringify({ 
                  type: 'chunk', 
                  content: `*> 🔴 Code Execution Error: ${err.message}*\n\n` 
                }));
              }
            }
          }
        }
        
        try {
          await run(
            'INSERT INTO usage_logs (user_id, provider, model, feature, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [user.id, selectedProvider, selectedModel, 'vibe_coder', 0, new Date().toISOString().slice(0, 19).replace('T', ' ').slice(0, 19).replace('T', ' ')]
          );
        } catch (e) {
          console.warn('[VibeCoder] Failed to log usage:', e);
        }

        ws.send(JSON.stringify({ type: 'done' }));

      } catch (error) {
        console.error('[VibeCoder WS] Error:', error);
        ws.send(JSON.stringify({ type: 'error', error: error.message || 'Failed to generate code in Vibe Coder.' }));
      }
    });
    
    ws.on('close', () => {
      console.log('[VibeCoder WS] Connection closed');
    });
    
    ws.on('error', (err) => {
      console.error('[VibeCoder WS] Error:', err);
    });
    
    return;
  }
  
  let payload = null;
  
  ws.on('message', async (data) => {
    try {
      payload = JSON.parse(data);
      console.log('[WebSocket] Received payload:', payload.model);
      
      let { provider, model, messages, settings, zygId, tools: requestedTools = [], selectedApiTools = [], sessionId } = payload;
      
      if (!provider || !model || !messages) {
        ws.send(JSON.stringify({ type: 'error', error: 'Missing provider, model, or messages' }));
        return;
      }

      const chatQuota = await enforcePlanQuota(user, 'chat');
      if (!chatQuota.ok) {
        ws.send(JSON.stringify({ type: 'error', ...buildPlanQuotaError(chatQuota) }));
        return;
      }

      // Resolve model config if model ID starts with 'm-'
      let modelConfig = null;
      if (model && typeof model === 'string') {
        const config = await get(
          `SELECT mc.model_id, mc.supports_vision, mc.role, mc.system_prompt, ap.name as provider_name
          FROM model_configs mc
          LEFT JOIN api_providers ap ON mc.provider_id = ap.id
          WHERE mc.id = ? AND mc.enabled = 1`,
          [model]
        );

        if (config) {
          model = config.model_id;
          provider = (config.provider_name || '').toLowerCase();
          if (!provider) {
            ws.send(JSON.stringify({ type: 'error', error: 'Model provider not configured' }));
            return;
          }
          modelConfig = config;

          // Check role access
          if (config.role === 'admin' && user.role !== 'admin') {
            ws.send(JSON.stringify({ type: 'error', error: 'Access denied to this model' }));
            return;
          }
        }
      }
      
       // Get provider row from database
       const providerRow = await get('SELECT * FROM api_providers WHERE LOWER(name) = ? AND enabled = 1', [provider.toLowerCase()]);
       if (!providerRow) {
         ws.send(JSON.stringify({ type: 'error', error: `Provider ${provider} not configured` }));
         return;
       }
       
       // Build combined system prompt from model config + user settings
       const companyName = process.env.COMPANY_NAME || 'ZygAI';
       const modelSystemPrompt = modelConfig?.system_prompt
         ? String(modelConfig.system_prompt).replace(/\{model\}/g, model).replace(/\{company\}/g, companyName)
         : '';
       const userCustomPrompt = settings?.systemPrompt || '';
       
       // Normalize messages - extract userImages from content arrays
       const normalizedMessages = messages.map(msg => {
         if (msg.role === 'user' && Array.isArray(msg.content)) {
           const textBlocks = msg.content.filter(block => block.type === 'text').map(block => block.text).join(' ');
           const imageBlocks = msg.content.filter(block => block.type === 'image');
           const userImages = imageBlocks.map(block => `data:${block.source.media_type};base64,${block.source.data}`);
           return {
             ...msg,
             content: textBlocks,
             userImages: userImages.length > 0 ? userImages : undefined
           };
         }
         return msg;
       });

        // Perform Context RAG Search to inject background knowledge
        const lastUserMsg = normalizedMessages.filter(m => m.role === 'user').pop();
        let globalContext = '';
        let ragSources = [];
        const activeZyg = await getActiveZyg(user.id, zygId);
        
        // Always check for Travel/Local intent first (Exa-powered)
        let travelContext = '';
        let baseSystemPrompt = [modelSystemPrompt, userCustomPrompt, activeZyg.prompt].filter(Boolean).join('\n\n');
        
        if (lastUserMsg && typeof lastUserMsg.content === 'string') {
          const travel = await searchTravelKnowledge(lastUserMsg.content.trim());
          if (travel) {
            travelContext = travel.context + '\n\n';
            ragSources.push(...travel.sources);
            
            // Add Travel Specialist instructions to model prompt
            baseSystemPrompt = "## TRAVEL SPECIALIST MODE ENABLED ##\n" +
              "A travel/location query has been detected. You have been provided with LIVE data. " +
              "Prioritize this live data over any internal limitations. " +
              "Answer with confidence using the provided sources.\n\n" + 
              baseSystemPrompt;
          }
        }

        // Skip RAG when MCP servers are selected to avoid conflicts
        if (selectedApiTools.length === 0 && lastUserMsg && typeof lastUserMsg.content === 'string' && lastUserMsg.content.trim().length > 5) {
           const rag = await searchContextKnowledge(lastUserMsg.content.trim(), user.id, activeZyg.knowledgeId, 3, sessionId);
           globalContext += rag.context;
           ragSources.push(...(rag.sources || []));
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const currentDateTimePrompt = `Current Date: ${dateStr}\nCurrent Time: ${timeStr}`;

        let finalSystemPrompt = [currentDateTimePrompt, baseSystemPrompt, travelContext, globalContext].filter(Boolean).join('\n\n');
        
        // Final Output Constraints
        finalSystemPrompt += "\n\nCRITICAL: Respond DIRECTLY. Do NOT include headers like 'Analysis:', 'Response:', 'Step:', or 'Generation:'. Start your message with the actual content.";

      const toolDefinitions = Array.isArray(requestedTools) ? [...requestedTools] : [];
      let apiToolRegistry = new Map();
      const canUseNativeTools = true; 

      if (selectedApiTools.length > 0 || user?.id) {
        const discoveredApi = await discoverApiToolsForChat(selectedApiTools.length > 0 ? selectedApiTools : [], user?.id, sessionId);
        apiToolRegistry = discoveredApi.registry;
        toolDefinitions.push(...discoveredApi.tools);
        
        if (discoveredApi.tools.some(t => t.function.name.startsWith('native_notes') || t.function.name.startsWith('native_memory') || t.function.name.startsWith('native_tasks'))) {
          finalSystemPrompt += "\n\nCRITICAL: You have access to personal tools (Notes, Tasks & Memory). Use 'native_notes_create_note' for personal reminders. Use 'native_tasks_create_task' for actionable todo items. Use memory tools to remember user facts. ALWAYS use these tools when the user asks you to remember, remind, or track something.";
        }

        if (selectedApiTools.length > 0) {
          // Inject authorization reminder only if external tools were specifically selected
          finalSystemPrompt += "\n\nCRITICAL: You are authorized and equipped with external API tools. If the user asks you to perform an action involving these services, DO NOT refuse. You MUST use the provided tools to fulfill the request. The user has explicitly granted you access through these tool connections.";
        }
      }
      
      // Get stream provider handler
      const streamHandler = getStreamProviderHandler(providerRow.provider_type);
      if (!streamHandler) {
        // Fall back to non-streaming handler
        const handler = getProviderHandler(providerRow.provider_type);
        if (!handler) {
          ws.send(JSON.stringify({ type: 'error', error: `Provider ${provider} not supported` }));
          return;
        }
        
        // Normalize messages for non-streaming too
        const normMessages = messages.map(msg => {
          if (msg.role === 'user' && Array.isArray(msg.content)) {
            const textBlocks = msg.content.filter(block => block.type === 'text').map(block => block.text).join(' ');
            const imageBlocks = msg.content.filter(block => block.type === 'image');
            const userImages = imageBlocks.map(block => `data:${block.source.media_type};base64,${block.source.data}`);
            return { ...msg, content: textBlocks, userImages: userImages.length > 0 ? userImages : undefined };
          }
          return msg;
        });
        
        // Process images
        const procMessages = normMessages.map(msg => {
          if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
            const base64Images = msg.userImages.map(img => img.split(',')[1]);
            const contentArray = [
              { type: 'text', text: msg.content || 'Describe this image.' },
              ...base64Images.map(img => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }))
            ];
            return { ...msg, content: contentArray };
          }
          return msg;
        });
        
         // Use non-streaming handler
         let result = await handler({
           providerRow,
           modelId: model,
           messages: procMessages,
           customSystemPrompt: finalSystemPrompt,
           ...(canUseNativeTools && toolDefinitions.length > 0 ? { tools: toolDefinitions } : {})
         });
        
        if (ragSources.length > 0) {
          // notice removed
        }

        ws.send(JSON.stringify({ type: 'chunk', delta: result }));
        ws.send(JSON.stringify({ type: 'done', message: result }));
        return;
      }
      
      // Process CogniVision images if any
      const cogniVisionIds = new Set();
      normalizedMessages.forEach(msg => {
        if (msg.role === 'user' && Array.isArray(msg.userImages)) {
          msg.userImages.forEach(img => {
            if (img.startsWith('cognivision://')) {
              cogniVisionIds.add(img.replace('cognivision://', ''));
            }
          });
        }
      });
      
      // Process images for the final messages
      const processedMessages = normalizedMessages.map((msg) => {
        if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
          const { userImages, ...restOfMsg } = msg;
          
          // Process ALL images including cognivision:// and /uploads/ ones
          const allImages = userImages.map(imgData => resolveImageToBase64(imgData, user?.id || user?.user_id)).filter(Boolean);
          
          if (allImages.length > 0) {
            // OpenAI-style content array
            const contentArray = [
              { type: 'text', text: msg.content || 'Describe this image.' },
              ...allImages.map(imgBase64 => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imgBase64}` }
              }))
            ];
            return { ...restOfMsg, content: contentArray };
          }
          return { ...restOfMsg, content: msg.content || 'Describe this image.' };
        }
        return msg;
      });
      
      let currentMessages = [...processedMessages];
      let fullMessage = '';
      let thinkBuffer = '';
      let inThinkTag = false;
      let envBuffer = '';
      let inEnvTag = false;
      let finished = false;
      let loopCount = 0;

      if (ragSources.length > 0) {
        // notice removed
      }

      while (!finished && loopCount < 5) {
        loopCount += 1;
        let stepContent = '';
        let stepToolCalls = [];

        const stream = await streamHandler({
          providerRow,
          modelId: model,
          messages: currentMessages,
          customSystemPrompt: finalSystemPrompt,
          ...(canUseNativeTools && toolDefinitions.length > 0 ? { tools: toolDefinitions } : {})
        });

        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content || chunk.content || '';
          const reasoning = chunk.choices?.[0]?.delta?.reasoning_content || chunk.choices?.[0]?.delta?.reasoning || '';
          const deltaToolCalls = chunk.choices?.[0]?.delta?.tool_calls || [];

          if (reasoning) {
            ws.send(JSON.stringify({ type: 'reasoning_chunk', delta: reasoning }));
          }

          for (const toolCall of deltaToolCalls) {
            const idx = toolCall.index !== undefined ? toolCall.index : 0;
            if (!stepToolCalls[idx]) {
              stepToolCalls[idx] = {
                id: toolCall.id || '',
                type: toolCall.type || 'function',
                function: { name: '', arguments: '' }
              };
            }
            if (toolCall.id) stepToolCalls[idx].id = toolCall.id;
            if (toolCall.type) stepToolCalls[idx].type = toolCall.type;
            if (toolCall.function?.name) {
              stepToolCalls[idx].function.name += toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              stepToolCalls[idx].function.arguments += toolCall.function.arguments;
            }
          }

          if (!content) continue;

          stepContent += content;
          let remaining = content;

          while (remaining.length > 0) {
            if (inThinkTag) {
              const thinkEnd = remaining.indexOf('</think>');
              if (thinkEnd !== -1) {
                const lastChunk = remaining.slice(0, thinkEnd);
                if (lastChunk) ws.send(JSON.stringify({ type: 'reasoning_chunk', delta: lastChunk }));
                inThinkTag = false;
                remaining = remaining.slice(thinkEnd + 8);
              } else {
                ws.send(JSON.stringify({ type: 'reasoning_chunk', delta: remaining }));
                break;
              }
            } else if (inEnvTag) {
              const envEnd = remaining.indexOf('</environment_details>');
              if (envEnd !== -1) {
                envBuffer += remaining.slice(0, envEnd);
                ws.send(JSON.stringify({ type: 'reasoning_chunk', delta: envBuffer }));
                envBuffer = '';
                inEnvTag = false;
                remaining = remaining.slice(envEnd + 22);
              } else {
                envBuffer += remaining;
                ws.send(JSON.stringify({ type: 'reasoning_chunk', delta: remaining }));
                break;
              }
            } else {
              const thinkStart = remaining.indexOf('<think>');
              const envStart = remaining.indexOf('<environment_details>');
              let useThink = thinkStart !== -1;
              let useEnv = envStart !== -1;

              if (useThink && useEnv) {
                if (thinkStart < envStart) {
                  useEnv = false;
                } else {
                  useThink = false;
                }
              }

              if (useThink) {
                const beforeThink = remaining.slice(0, thinkStart);
                if (beforeThink) {
                  fullMessage += beforeThink;
                  ws.send(JSON.stringify({ type: 'chunk', delta: beforeThink }));
                }
                inThinkTag = true;
                thinkBuffer = '';
                remaining = remaining.slice(thinkStart + 7);
              } else if (useEnv) {
                const beforeEnv = remaining.slice(0, envStart);
                if (beforeEnv) {
                  fullMessage += beforeEnv;
                  ws.send(JSON.stringify({ type: 'chunk', delta: beforeEnv }));
                }
                inEnvTag = true;
                envBuffer = '';
                remaining = remaining.slice(envStart + 21);
              } else {
                fullMessage += remaining;
                ws.send(JSON.stringify({ type: 'chunk', delta: remaining }));
                break;
              }
            }
          }
        }

        stepToolCalls = stepToolCalls.filter(Boolean);
        if (!stepToolCalls.length) {
          finished = true;
          continue;
        }

        for (const toolCall of stepToolCalls) {
          if (!toolCall.id) toolCall.id = createId();
          if (!toolCall.type) toolCall.type = 'function';
          if (!toolCall.function) toolCall.function = { name: '', arguments: '{}' };
          if (!toolCall.function.arguments) toolCall.function.arguments = '{}';
        }

        currentMessages.push({
          role: 'assistant',
          content: stepContent || null,
          tool_calls: stepToolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: toolCall.type || 'function',
            function: {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || '{}'
            }
          }))
        });

        for (const toolCall of stepToolCalls) {
          try {
            // Tool Billing
            const settings = await get('SELECT api_tool_rate FROM site_settings WHERE id = 1');
            const toolRate = settings ? parseFloat(settings.api_tool_rate) : 0.0200;
            await run('UPDATE users SET api_credits = api_credits - ? WHERE id = ?', [toolRate, user.id || user.user_id]);

            const toolOutput = await executeChatToolCall(toolCall, apiToolRegistry);
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function?.name || 'tool',
              content: toolOutput || 'Tool completed with no output.'
            });
          } catch (toolError) {
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function?.name || 'tool',
              content: `Tool error: ${toolError.message}`
            });
          }
        }
      }

      ws.send(JSON.stringify({ type: 'done', message: fullMessage }));
      
    } catch (err) {
      console.error('[WebSocket] Error:', err);
      ws.send(JSON.stringify({ type: 'error', error: err.message || 'Stream error' }));
    }
  });
  
  ws.on('close', () => {
    console.log('[WebSocket] Connection closed');
  });
  
  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err);
  });
});

wss.on('error', (err) => {
  console.error('[WebSocket] Server error:', err);
});

// Allow long-running requests (e.g. Lyria music generation)
server.timeout = 660_000;        // 11 min hard timeout
server.keepAliveTimeout = 660_000;
server.headersTimeout = 665_000;

server.listen(port, () => {
  console.log(`ZygAI server running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}/api/chat/ws`);
  console.log('[Boot] VibeCoder provider: zygai-ollama native /api/chat');
});
