import { run, get, all } from './db.js';
import { callExa } from './exa.js';
import { encryptMessage, decryptMessage } from './encryption.js';
import { sendEmailWithConfig } from './email.js';
import { getProviderHandler } from './providers/index.js';
import { randomUUID } from 'crypto';
import { resolveModelConfig } from './model-resolver.js';

/**
 * Helper to get the Reach model configuration
 */
const getReachModelConfig = async () => {
  const config = await get("SELECT * FROM feature_model_settings WHERE feature_key = 'reach'");
  if (!config) return null;

  // First try to resolve the model ID directly
  const resolved = await resolveModelConfig(config.model_id);
  if (resolved) {
    return {
      providerRow: {
        id: resolved.provider.id,
        name: resolved.provider.name,
        provider_type: resolved.provider.type,
        base_url: resolved.provider.baseUrl,
        api_key: resolved.provider.apiKey
      },
      modelId: resolved.modelId,
      systemPrompt: resolved.systemPrompt || config.system_prompt
    };
  }

  // Fallback to searching by provider name if resolution failed (e.g. for native/local)
  const providerRow = await get("SELECT * FROM api_providers WHERE name = ? OR provider_type = ?", [config.provider, config.provider]);
  
  return {
    providerRow,
    modelId: config.model_id,
    systemPrompt: config.system_prompt
  };
};

/**
 * Helper to call the AI provider for Reach tasks
 */
const callReachAI = async (messages, customPrompt = null) => {
  const config = await getReachModelConfig();
  if (!config) {
    throw new Error('Reach AI configuration not found');
  }

  const handler = getProviderHandler(config.providerRow?.provider_type || 'zygai');
  if (!handler) {
    throw new Error(`AI Provider handler not found for: ${config.providerRow?.provider_type}`);
  }

  const response = await handler({
    providerRow: config.providerRow,
    modelId: config.modelId,
    messages,
    customSystemPrompt: customPrompt || config.systemPrompt
  });

  return typeof response === 'string' ? response : response.content;
};

export const setupReachRoutes = (app, authMiddleware) => {
  // Search for leads
  app.post('/api/reach/search', authMiddleware, async (req, res) => {
    const { query, campaignId } = req.body;
    const userId = req.user.id;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    try {
      // 1. Search Exa
      console.log(`[Reach] Searching Exa for: "${query}"`);
      const searchResults = await callExa(query).catch(err => {
        console.error('[Reach] Exa search error:', err);
        throw err;
      });
      console.log(`[Reach] Exa returned ${searchResults.length} results`);
      
      if (searchResults.length === 0) {
        console.log(`[Reach] No results found on Exa for: "${query}"`);
        return res.json({ success: true, leads: [], message: 'No search results found on the web for this query.' });
      }

      // 2. Extract leads using ZygAI
      const config = await getReachModelConfig();
      if (!config) {
        throw new Error('Reach AI configuration not found');
      }

      const prompt = `You are a lead extraction agent. I will provide you with search results from the web.
      Your task is to identify and extract professional contacts (leads).
      
      For each lead, I need:
      1. Name (Person's name)
      2. Email (MUST be a valid email address found in the text)
      3. Company (Company or Organization name)
      4. Source URL (The URL where you found this lead)
      
      IMPORTANT RULES:
      - If you cannot find a valid email address for a lead, DO NOT include them.
      - Never make up or guess an email.
      - Return ONLY a JSON array of objects. No other text or explanation.
      
      Search Results:
      ${JSON.stringify(searchResults)}
      
      RESPONSE FORMAT (JSON ONLY):
      [{"name": "...", "email": "...", "company": "...", "source_url": "..."}]`;

      console.log(`[Reach] Calling AI (${config.modelId || 'default'} on ${config.providerRow?.name || 'unknown'}) to extract leads...`);
      const leadsText = await callReachAI([{ role: 'user', content: prompt }]).catch(err => {
        console.error('[Reach] AI extraction error:', err);
        throw new Error(`AI extraction failed: ${err.message}`);
      });
      
      let leads = [];
      try {
        // Robust JSON extraction (handle markdown blocks)
        let cleaned = leadsText.trim();
        if (cleaned.includes('```')) {
          const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match) cleaned = match[1];
        }
        
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
        
        leads = JSON.parse(jsonStr);
        if (!Array.isArray(leads)) leads = [];
        console.log(`[Reach] AI returned ${leads.length} raw leads`);
      } catch (e) {
        console.error('[Reach] Failed to parse leads JSON:', e.message);
        console.log('[Reach] Raw AI response:', leadsText);
      }

      // 3. Save leads to DB
      const savedLeads = [];
      for (const lead of leads) {
        // Validation
        const email = (lead.email || '').trim().toLowerCase();
        if (!email || email.includes('unknown') || email.includes('@example.com') || !email.includes('@')) {
          continue;
        }
        
        const id = randomUUID();
        await run(
          `INSERT INTO reach_leads (id, user_id, campaign_id, email, name, company, source_url, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
          [id, userId, campaignId || null, email, lead.name || null, lead.company || null, lead.source_url || null, new Date().toISOString(), new Date().toISOString()]
        );
        savedLeads.push({ ...lead, id, email });
      }

      console.log(`[Reach] Process complete. Saved ${savedLeads.length} valid leads to DB.`);
      res.json({ success: true, leads: savedLeads });
    } catch (error) {
      console.error('Reach search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get leads
  app.get('/api/reach/leads', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
      const leads = await all('SELECT * FROM reach_leads WHERE user_id = ? ORDER BY created_at DESC', [userId]);
      res.json({ leads });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update lead status
  app.patch('/api/reach/leads/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;

    try {
      await run(
        'UPDATE reach_leads SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND user_id = ?',
        [status, notes, new Date().toISOString(), id, userId]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete lead
  app.delete('/api/reach/leads/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
      await run('DELETE FROM reach_leads WHERE id = ? AND user_id = ?', [id, userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send outreach
  app.post('/api/reach/outreach', authMiddleware, async (req, res) => {
    const { leadIds, template } = req.body;
    const userId = req.user.id;

    if (!leadIds || !leadIds.length || !template) {
      return res.status(400).json({ error: 'Leads and template are required' });
    }

    try {
      // 1. Get SMTP settings
      const smtp = await get('SELECT * FROM user_smtp_settings WHERE user_id = ?', [userId]);
      if (!smtp) return res.status(400).json({ error: 'SMTP settings not configured. Please set them up in Reach settings.' });

      // Decrypt password
      let password = '';
      if (smtp.pass_encrypted) {
        password = decryptMessage(smtp.pass_encrypted, smtp.pass_iv, smtp.pass_auth_tag);
      }

      const smtpConfig = {
        host: smtp.host,
        port: smtp.port,
        secure: !!smtp.secure,
        user: smtp.user,
        pass: password,
        fromEmail: smtp.from_email,
        fromName: smtp.from_name
      };

      // 2. Get leads
      const leads = await all(`SELECT * FROM reach_leads WHERE user_id = ? AND id IN (${leadIds.map(() => '?').join(',')})`, [userId, ...leadIds]);

      const results = [];
      for (const lead of leads) {
        // Generate personalized content
        const genPrompt = `Generate a personalized outreach email based on the following information:
        Recipient Name: ${lead.name || 'there'}
        Company: ${lead.company || 'your company'}
        
        Template:
        ${template}
        
        Guidelines:
        - Keep it professional and concise.
        - Replace placeholders like [Name] or [Company] appropriately.
        - Return ONLY a JSON object: {"subject": "...", "body": "..."}`;

        const genContent = await callReachAI([{ role: 'user', content: genPrompt }]);

        let emailContent;
        try {
          const jsonMatch = genContent.match(/\{.*\}/s);
          emailContent = JSON.parse(jsonMatch ? jsonMatch[0] : genContent);
        } catch (e) {
          console.error('Failed to parse personalized email JSON:', e);
          emailContent = { subject: 'Connecting with ' + (lead.company || 'you'), body: genContent };
        }

        // Send email
        const sendResult = await sendEmailWithConfig({
          config: smtpConfig,
          to: lead.email,
          subject: emailContent.subject,
          text: emailContent.body,
          html: emailContent.body.replace(/\n/g, '<br>')
        });

        if (sendResult.sent) {
          await run('UPDATE reach_leads SET status = "contacted", updated_at = ? WHERE id = ?', [new Date().toISOString(), lead.id]);
        }

        results.push({ leadId: lead.id, email: lead.email, sent: sendResult.sent, error: sendResult.error });
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Outreach error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // SMTP Settings
  app.get('/api/reach/smtp', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
      const smtp = await get('SELECT host, port, user, secure, from_email, from_name FROM user_smtp_settings WHERE user_id = ?', [userId]);
      res.json({ smtp: smtp || null });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/reach/smtp', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { host, port, user, pass, secure, fromEmail, fromName } = req.body;

    if (!host || !port || !fromEmail) {
      return res.status(400).json({ error: 'Host, port, and fromEmail are required' });
    }

    try {
      let encrypted = null, iv = null, authTag = null;
      if (pass) {
        const encryptedData = encryptMessage(pass);
        encrypted = encryptedData.encrypted;
        iv = encryptedData.iv;
        authTag = encryptedData.authTag;
      } else {
        // If password is not provided, check if we already have one
        const existing = await get('SELECT pass_encrypted, pass_iv, pass_auth_tag FROM user_smtp_settings WHERE user_id = ?', [userId]);
        if (existing) {
          encrypted = existing.pass_encrypted;
          iv = existing.pass_iv;
          authTag = existing.pass_auth_tag;
        }
      }

      await run(
        `INSERT INTO user_smtp_settings (user_id, host, port, user, pass_encrypted, pass_iv, pass_auth_tag, secure, from_email, from_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         host=VALUES(host), port=VALUES(port), user=VALUES(user), 
         pass_encrypted=VALUES(pass_encrypted), pass_iv=VALUES(pass_iv), pass_auth_tag=VALUES(pass_auth_tag),
         secure=VALUES(secure), from_email=VALUES(from_email), from_name=VALUES(from_name), updated_at=VALUES(updated_at)`,
        [userId, host, parseInt(port), user || null, encrypted, iv, authTag, secure ? 1 : 0, fromEmail, fromName || null, new Date().toISOString()]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('SMTP update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Campaigns
  app.get('/api/reach/campaigns', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
      const campaigns = await all('SELECT * FROM reach_campaigns WHERE user_id = ? ORDER BY created_at DESC', [userId]);
      res.json({ campaigns });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create Campaign
  app.post('/api/reach/campaigns', authMiddleware, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;
    const id = randomUUID();

    try {
      await run(
        'INSERT INTO reach_campaigns (id, user_id, name, status, created_at, updated_at) VALUES (?, ?, ?, "active", ?, ?)',
        [id, userId, name, new Date().toISOString(), new Date().toISOString()]
      );
      res.json({ success: true, campaign: { id, name, status: 'active' } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};
