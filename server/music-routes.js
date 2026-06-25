// ═══════════════════════════════════════════════════════════════════════════
//  ZygMusic — server routes
//  Paste this block into server/index.js, near the /api/generate-image route
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Add music_generation to PLAN_QUOTAS ──────────────────────────────────
// In the PLAN_QUOTAS object (around line 808), add:
/*
  music_generation: {
    label: 'music generations',
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    limits: {
      free: 2,
      go: 20,
      plus: 50,
      beta: 50,
      paid: 50,
      ad: 2
    }
  },
*/

// ─── 2. Add music_packet_credits column to users table ───────────────────────
// Run this SQL migration (see music.sql):
// ALTER TABLE users ADD COLUMN music_packet_credits INTEGER NOT NULL DEFAULT 0;

// ─── 3. Music uploads directory setup ────────────────────────────────────────
// Add this near the top of index.js where other upload dirs are created:
/*
const musicUploadsDir = path.join(__dirname, '..', 'public', 'music');
if (!fs.existsSync(musicUploadsDir)) {
  fs.mkdirSync(musicUploadsDir, { recursive: true });
}
app.use('/music', express.static(musicUploadsDir));
*/

// ─── 4. Music config endpoint ────────────────────────────────────────────────
app.get('/api/music-config', authMiddleware, async (req, res) => {
  const userPlan = req.user?.plan || 'free';
  const musicQuota = getPlanQuota('music_generation', userPlan);
  const musicUsage = req.user?.id
    ? await getRateLimit(`plan-quota:music_generation:${req.user.id}`)
    : null;

  const quotaUsed = musicUsage?.count || 0;

  const userRow = await get(
    'SELECT music_packet_credits FROM users WHERE id = ?',
    [req.user.id]
  );
  const packetCredits = userRow?.music_packet_credits || 0;

  return res.json({
    quotaUsed,
    quotaLimit: req.user.role === 'admin' ? null : (musicQuota?.limit ?? 0),
    packetCredits,
    plan: userPlan,
    isUnlimited: req.user.role === 'admin',
  });
});

// ─── 5. Music history endpoint ───────────────────────────────────────────────
app.get('/api/music-history', authMiddleware, async (req, res) => {
  const tracks = await all(
    `SELECT id, prompt, audio_url as audioUrl, created_at as createdAt
     FROM music_generations
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json({ tracks: tracks.map(t => ({ ...t, status: 'ready' })) });
});

// ─── 6. Music generation endpoint ────────────────────────────────────────────
app.post('/api/generate-music', authMiddleware, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt required.' });
  }

  // Quota enforcement: plan quota first, then packet credits
  const userRow = await get(
    'SELECT music_packet_credits FROM users WHERE id = ?',
    [req.user.id]
  );
  const packetCredits = userRow?.music_packet_credits || 0;

  const quotaResult = await enforcePlanQuota(req.user, 'music_generation');

  if (!quotaResult.ok) {
    if (packetCredits <= 0) {
      return res.status(429).json({
        ...buildPlanQuotaError(quotaResult),
        error: 'Daily music limit reached. Purchase a music packet to continue.',
      });
    }
    // Deduct one packet credit
    await run(
      'UPDATE users SET music_packet_credits = music_packet_credits - 1 WHERE id = ? AND music_packet_credits > 0',
      [req.user.id]
    );
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return res.status(500).json({ error: 'OpenRouter not configured.' });
  }

  try {
    // Lyria 3 Pro uses chat completions with audio output modality
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || process.env.FRONTEND_URL || '',
        'X-Title': 'ZygAI Music',
      },
      body: JSON.stringify({
        model: 'google/lyria-3-pro-preview',
        modalities: ['audio'],
        audio: { format: 'mp3' },
        messages: [
          {
            role: 'user',
            content: prompt.trim(),
          },
        ],
      }),
    });

    if (!orRes.ok) {
      const errBody = await orRes.json().catch(() => ({}));
      console.error('[ZygMusic] OpenRouter error:', errBody);
      return res.status(502).json({ error: errBody?.error?.message || 'Music generation failed.' });
    }

    const orData = await orRes.json();

    // Extract base64 audio from response
    // OpenRouter returns it in message.audio or content blocks
    let audioBase64 = null;
    let mimeType = 'audio/mpeg';

    const msg = orData?.choices?.[0]?.message;

    if (msg?.audio?.data) {
      // Standard audio output format
      audioBase64 = msg.audio.data;
      mimeType = msg.audio.mime_type || 'audio/mpeg';
    } else if (Array.isArray(msg?.content)) {
      // Content block format
      for (const block of msg.content) {
        if (block.type === 'audio' && block.audio?.data) {
          audioBase64 = block.audio.data;
          mimeType = block.audio.mime_type || 'audio/mpeg';
          break;
        }
        if (block.type === 'input_audio' && block.input_audio?.data) {
          audioBase64 = block.input_audio.data;
          mimeType = 'audio/mpeg';
          break;
        }
      }
    }

    if (!audioBase64) {
      console.error('[ZygMusic] Unexpected response shape:', JSON.stringify(orData).slice(0, 500));
      return res.status(502).json({ error: 'No audio returned from model.' });
    }

    // Save audio file to public/music/
    const id = createId();
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'mp3';
    const filename = `${id}.${ext}`;
    const musicDir = path.join(__dirname, '..', 'public', 'music');

    if (!fs.existsSync(musicDir)) {
      fs.mkdirSync(musicDir, { recursive: true });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(path.join(musicDir, filename), audioBuffer);

    const audioUrl = `/music/${filename}`;
    const now = new Date().toISOString();

    await run(
      'INSERT INTO music_generations (id, user_id, prompt, audio_url, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.id, prompt.trim(), audioUrl, now]
    );

    return res.json({ id, audioUrl, prompt: prompt.trim(), createdAt: now });
  } catch (err) {
    console.error('[ZygMusic] Generation error:', err);
    return res.status(500).json({ error: 'Music generation failed.' });
  }
});

// ─── 7. Music file serve endpoint (backup if static middleware not set up) ────
app.get('/api/music/:filename', authMiddleware, (req, res) => {
  const filename = req.params.filename;
  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const filePath = path.join(__dirname, '..', 'public', 'music', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found.' });
  }
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.wav' ? 'audio/wav' : ext === '.ogg' ? 'audio/ogg' : 'audio/mpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.sendFile(filePath);
});

// ─── 8. Music packet Stripe checkout ─────────────────────────────────────────
app.post('/api/stripe/create-music-packet-session', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured.' });

  const VALID_PACKETS = {
    music_5:  { price: 5,  credits: 20,  name: 'ZygMusic Starter Pack — 20 Generations' },
    music_10: { price: 10, credits: 50,  name: 'ZygMusic Creator Pack — 50 Generations' },
    music_25: { price: 25, credits: 150, name: 'ZygMusic Studio Pack — 150 Generations' },
    music_50: { price: 50, credits: 350, name: 'ZygMusic Pro Pack — 350 Generations' },
  };

  const { packetId, amount } = req.body;
  const packet = VALID_PACKETS[packetId];

  if (!packet) return res.status(400).json({ error: 'Invalid packet.' });
  if (packet.price !== amount) return res.status(400).json({ error: 'Price mismatch.' });

  const successUrl = process.env.STRIPE_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CANCEL_URL;
  const baseSuccessUrl = (successUrl || '').endsWith('/')
    ? successUrl.slice(0, -1)
    : successUrl;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: packet.name,
            description: `Adds ${packet.credits} music generation credits. Credits never expire.`,
          },
          unit_amount: Math.round(packet.price * 100),
        },
        quantity: 1,
      }],
      customer_email: req.user.email,
      success_url: `${baseSuccessUrl}?session_id={CHECKOUT_SESSION_ID}&type=music_packet`,
      cancel_url: cancelUrl,
      metadata: {
        userId: req.user.id,
        type: 'music_packet',
        packetId,
        credits: packet.credits.toString(),
      },
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[Stripe] Music packet session failed:', err);
    res.status(500).json({ error: 'Failed to initiate checkout.' });
  }
});

// ─── 9. Stripe webhook — add music_packet case ───────────────────────────────
// In the existing stripe webhook handler, inside checkout.session.completed,
// add this alongside the existing 'topup' type check:
/*
    if (type === 'music_packet' && userId) {
      const credits = parseInt(session.metadata.credits || '0', 10);
      if (credits > 0) {
        await run(
          'UPDATE users SET music_packet_credits = music_packet_credits + ? WHERE id = ?',
          [credits, userId]
        );
        console.log(`[Stripe Webhook] Music packet: +${credits} credits for user ${userId}`);
      }
    }
*/
