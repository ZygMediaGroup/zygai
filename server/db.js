import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';

let pool;

const ensurePool = () => {
  if (pool) return pool;
  const mysqlUrl = process.env.MYSQL_URL;
  if (!mysqlUrl) {
    throw new Error('MYSQL_URL environment variable is required.');
  }
  pool = mysql.createPool(mysqlUrl, {
    waitForConnections: true,
    connectionLimit: 50,
    maxIdle: 20,
    idleTimeout: 60000, // 60 seconds
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000, // 10 seconds
    charset: 'utf8mb4'
  });

  // Handle unexpected errors on idle connections to prevent process crashes
  pool.on('error', (err) => {
    console.error('Unexpected error on idle MySQL pool connection:', err);
    if (err.code === 'ECONNRESET') {
      console.warn('MySQL connection was reset by the server. The pool will automatically handle reconnection.');
    }
  });

  return pool;
};

const run = async (sql, params = []) => {
  const [result] = await ensurePool().execute(sql, params);
  return {
    lastID: result.insertId || null,
    insertId: result.insertId || null,
    changes: result.affectedRows || 0,
    affectedRows: result.affectedRows || 0
  };
};

const get = async (sql, params = []) => {
  const [rows] = await ensurePool().execute(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
};

const all = async (sql, params = []) => {
  const [rows] = await ensurePool().execute(sql, params);
  return rows;
};

const columnExists = async (tableName, columnName) => {
  const [rows] = await ensurePool().execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const initDb = async () => {
  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) NOT NULL,
      email VARCHAR(254) NOT NULL,
      display_name VARCHAR(80) DEFAULT NULL,
      password_hash VARCHAR(255) NOT NULL,
      plan VARCHAR(20) NOT NULL DEFAULT 'free',
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      two_factor_enabled TINYINT NOT NULL DEFAULT 0,
      two_factor_secret VARCHAR(255) DEFAULT NULL,
      two_factor_pending_secret VARCHAR(255) DEFAULT NULL,
      al_access TINYINT NOT NULL DEFAULT 0,
      email_verified TINYINT NOT NULL DEFAULT 0,
      email_verification_token VARCHAR(255) DEFAULT NULL,
      email_verification_sent_at TEXT DEFAULT NULL,
      email_verification_expires_at TEXT DEFAULT NULL,
      stripe_customer_id VARCHAR(255) DEFAULT NULL,
      stripe_subscription_id VARCHAR(255) DEFAULT NULL,
      ai_role_id VARCHAR(36) DEFAULT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('users', 'display_name'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN display_name VARCHAR(80) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'stripe_customer_id'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'stripe_subscription_id'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'two_factor_enabled'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN two_factor_enabled TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('users', 'two_factor_secret'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'two_factor_pending_secret'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN two_factor_pending_secret VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'role'))) {
    await ensurePool().execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'");
  }
  if (!(await columnExists('users', 'al_access'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN al_access TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('users', 'email_verified'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN email_verified TINYINT NOT NULL DEFAULT 0');
    await ensurePool().execute('UPDATE users SET email_verified = 1');
  }
  if (!(await columnExists('users', 'email_verification_token'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'email_verification_sent_at'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN email_verification_sent_at TEXT DEFAULT NULL');
  }
  if (!(await columnExists('users', 'email_verification_expires_at'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN email_verification_expires_at TEXT DEFAULT NULL');
  }
  if (!(await columnExists('users', 'ai_role_id'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN ai_role_id VARCHAR(36) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'password_reset_token'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('users', 'password_reset_sent_at'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN password_reset_sent_at TEXT DEFAULT NULL');
  }
  if (!(await columnExists('users', 'password_reset_expires_at'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT DEFAULT NULL');
  }
  if (!(await columnExists('users', 'banned_from_marketplace'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN banned_from_marketplace TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('users', 'birthday_bonus_claimed'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN birthday_bonus_claimed TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('users', 'referred_by_id'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN referred_by_id VARCHAR(36) DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS birthday_wishes (
      id INT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      awarded_plan VARCHAR(20) DEFAULT NULL,
      PRIMARY KEY (id),
      CONSTRAINT fk_birthday_wishes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(36) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model VARCHAR(255) NOT NULL,
      feature VARCHAR(50) NOT NULL DEFAULT 'chat',
      latency_ms INT DEFAULT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_usage_logs_user (user_id),
      KEY idx_usage_logs_feature (feature)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('usage_logs', 'feature'))) {
    await ensurePool().execute('ALTER TABLE usage_logs ADD COLUMN feature VARCHAR(50) NOT NULL DEFAULT \'chat\'');
  }

  // Add vibe-specific limit columns to model_limits if they don't exist
  if (!(await columnExists('model_limits', 'free_limit_vibe'))) {
    await ensurePool().execute('ALTER TABLE model_limits ADD COLUMN free_limit_vibe INT DEFAULT NULL');
  }
  if (!(await columnExists('model_limits', 'go_limit_vibe'))) {
    await ensurePool().execute('ALTER TABLE model_limits ADD COLUMN go_limit_vibe INT DEFAULT NULL');
  }
  if (!(await columnExists('model_limits', 'plus_limit_vibe'))) {
    await ensurePool().execute('ALTER TABLE model_limits ADD COLUMN plus_limit_vibe INT DEFAULT NULL');
  }
  if (!(await columnExists('model_limits', 'beta_limit_vibe'))) {
    await ensurePool().execute('ALTER TABLE model_limits ADD COLUMN beta_limit_vibe INT DEFAULT NULL');
  }
  if (!(await columnExists('model_limits', 'vibe_coder_limit'))) {
    await ensurePool().execute('ALTER TABLE model_limits ADD COLUMN vibe_coder_limit INT DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS image_usage (
      id INT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(36) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model VARCHAR(255) NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_image_usage_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS pwa_installs (
      id INT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(36) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INT NOT NULL AUTO_INCREMENT,
      slug VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content LONGTEXT NOT NULL,
      meta_title VARCHAR(255) DEFAULT NULL,
      meta_description TEXT DEFAULT NULL,
      meta_image VARCHAR(500) DEFAULT NULL,
      published TINYINT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_blog_posts_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS site_settings (
    id INT NOT NULL DEFAULT 1,
    ads_enabled TINYINT NOT NULL DEFAULT 1,
    ad_rectangle_code LONGTEXT DEFAULT NULL,
    ad_overlay_code LONGTEXT DEFAULT NULL,
    ad_session_duration_seconds INT NOT NULL DEFAULT 30,
    ad_credit_duration_minutes INT NOT NULL DEFAULT 15,
    ad_max_session_minutes INT NOT NULL DEFAULT 60,
    zygs_marketplace_public TINYINT NOT NULL DEFAULT 1,
    prompts_marketplace_public TINYINT NOT NULL DEFAULT 1,
    vibe_coder_public TINYINT NOT NULL DEFAULT 0,
    reach_public TINYINT NOT NULL DEFAULT 0,
    vibe_coder_model VARCHAR(255) DEFAULT 'gpt-4o',
    reach_model VARCHAR(255) DEFAULT 'llama-3.1-8b-instruct',
    api_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0500,
    api_input_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0100,
    api_output_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0700,
    api_compact_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0200,
    api_tool_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0200,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await columnExists('site_settings', 'zygs_marketplace_public'))) {
    await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN zygs_marketplace_public TINYINT NOT NULL DEFAULT 1');
    }
    if (!(await columnExists('site_settings', 'prompts_marketplace_public'))) {
    await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN prompts_marketplace_public TINYINT NOT NULL DEFAULT 1');
    }
    if (!(await columnExists('site_settings', 'vibe_coder_public'))) {
    await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN vibe_coder_public TINYINT NOT NULL DEFAULT 0');
    }
    if (!(await columnExists('site_settings', 'reach_public'))) {
    await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN reach_public TINYINT NOT NULL DEFAULT 0');
    }
    if (!(await columnExists('site_settings', 'vibe_coder_model'))) {
    await ensurePool().execute("ALTER TABLE site_settings ADD COLUMN vibe_coder_model VARCHAR(255) DEFAULT 'gpt-4o'");
    }
    if (!(await columnExists('site_settings', 'reach_model'))) {
    await ensurePool().execute("ALTER TABLE site_settings ADD COLUMN reach_model VARCHAR(255) DEFAULT 'llama-3.1-8b-instruct'");
    }
    if (!(await columnExists('site_settings', 'api_rate_per_1m'))) {
      await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN api_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0500');
    }
    if (!(await columnExists('site_settings', 'api_input_rate_per_1m'))) {
      await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN api_input_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0100');
    }
    if (!(await columnExists('site_settings', 'api_output_rate_per_1m'))) {
      await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN api_output_rate_per_1m DECIMAL(10, 4) NOT NULL DEFAULT 0.0700');
    }
    if (!(await columnExists('site_settings', 'api_compact_rate'))) {
      await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN api_compact_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0200');
    }
    if (!(await columnExists('site_settings', 'api_tool_rate'))) {
      await ensurePool().execute('ALTER TABLE site_settings ADD COLUMN api_tool_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0200');
    }

    // Ensure the default settings row exists
    await ensurePool().execute(`
      INSERT IGNORE INTO site_settings (id, updated_at) 
      VALUES (1, ?)
    `, [new Date().toISOString()]);

      await ensurePool().execute(`    CREATE TABLE IF NOT EXISTS ad_sessions (
      id INT NOT NULL AUTO_INCREMENT,
      user_id VARCHAR(36) NOT NULL,
      ad_type VARCHAR(50) NOT NULL,
      ad_provider VARCHAR(100) DEFAULT NULL,
      ad_clicked TINYINT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_ad_sessions_user (user_id),
      CONSTRAINT fk_ad_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS user_time_credits (
      user_id VARCHAR(36) NOT NULL,
      remaining_seconds INT NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_user_time_credits_user FOREIGN KEY (user_id) REFERENCES users(id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS plan_settings (
      id VARCHAR(50) NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const planDefaults = ['free', 'go', 'plus', 'beta'];
  for (const planId of planDefaults) {
    await ensurePool().execute(
      `INSERT IGNORE INTO plan_settings (id, enabled, updated_at) VALUES (?, 1, ?)`,
      [planId, new Date().toISOString()]
    );
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS ai_roles (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model_id VARCHAR(255) NOT NULL,
      system_prompt LONGTEXT DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS feature_model_settings (
      feature_key VARCHAR(100) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model_id VARCHAR(255) NOT NULL,
      system_prompt LONGTEXT DEFAULT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (feature_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS feature_model_options (
      id INT NOT NULL AUTO_INCREMENT,
      feature_key VARCHAR(100) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      model_id VARCHAR(255) NOT NULL,
      label VARCHAR(255) DEFAULT NULL,
      position INT NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_feature_model_options (feature_key, provider, model_id),
      KEY idx_feature_model_options_feature (feature_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS prompts (
      id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body LONGTEXT NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS projects (
       id VARCHAR(36) NOT NULL,
       user_id VARCHAR(36) NOT NULL,
       title VARCHAR(255) NOT NULL,
       description TEXT DEFAULT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id),
       KEY idx_projects_user (user_id),
       CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   // Personal Knowledge (replaces Projects with RAG capabilities)
   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS personal_knowledge (
       id VARCHAR(36) NOT NULL,
       user_id VARCHAR(36) NOT NULL,
       name VARCHAR(255) NOT NULL,
       description TEXT DEFAULT NULL,
       system_prompt LONGTEXT DEFAULT NULL,
       is_global TINYINT NOT NULL DEFAULT 0,
       document_count INT NOT NULL DEFAULT 0,
       chunk_count INT NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id),
       KEY idx_personal_user (user_id),
       CONSTRAINT fk_personal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   if (!(await columnExists('personal_knowledge', 'is_global'))) {
     await ensurePool().execute('ALTER TABLE personal_knowledge ADD COLUMN is_global TINYINT NOT NULL DEFAULT 0');
   }

   // Knowledge Documents
   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS knowledge_documents (
       id VARCHAR(36) NOT NULL,
       knowledge_id VARCHAR(36) NOT NULL,
       filename VARCHAR(500) NOT NULL,
       mime_type VARCHAR(100) DEFAULT NULL,
       file_size INT NOT NULL,
       file_url TEXT DEFAULT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'processing',
       chunk_count INT NOT NULL DEFAULT 0,
       error_message TEXT DEFAULT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id),
       KEY idx_doc_knowledge (knowledge_id),
       CONSTRAINT fk_doc_knowledge FOREIGN KEY (knowledge_id) REFERENCES personal_knowledge(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   // Knowledge Chunks (for RAG retrieval)
   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS knowledge_chunks (
       id VARCHAR(36) NOT NULL,
       document_id VARCHAR(36) NOT NULL,
       knowledge_id VARCHAR(36) NOT NULL,
       chunk_index INT NOT NULL,
       content LONGTEXT NOT NULL,
       embedding LONGTEXT DEFAULT NULL,
       metadata JSON DEFAULT NULL,
       created_at TEXT NOT NULL,
       PRIMARY KEY (id),
       KEY idx_chunk_document (document_id),
       KEY idx_chunk_knowledge (knowledge_id),
       CONSTRAINT fk_chunk_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   // Personal Skills (user-specific prompts/agents)
   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS personal_skills (
       id VARCHAR(36) NOT NULL,
       user_id VARCHAR(36) NOT NULL,
       name VARCHAR(255) NOT NULL,
       description TEXT DEFAULT NULL,
       skill_type VARCHAR(50) NOT NULL DEFAULT 'prompt',
       config JSON DEFAULT NULL,
       enabled TINYINT NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id),
       KEY idx_skill_user (user_id),
       CONSTRAINT fk_skill_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

  if (!(await columnExists('personal_skills', 'is_global'))) {
    await ensurePool().execute('ALTER TABLE personal_skills ADD COLUMN is_global TINYINT NOT NULL DEFAULT 0');
  }

  if (!(await columnExists('personal_skills', 'knowledge_id'))) {
    await ensurePool().execute('ALTER TABLE personal_skills ADD COLUMN knowledge_id VARCHAR(36) DEFAULT NULL');
  }

  // Learning Materials (Flashcards, Quizzes, etc.)
  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS learning_materials (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      knowledge_id VARCHAR(36) DEFAULT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content JSON NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_learning_user (user_id),
      KEY idx_learning_knowledge (knowledge_id),
      CONSTRAINT fk_learning_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_learning_knowledge FOREIGN KEY (knowledge_id) REFERENCES personal_knowledge(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS ollama_cluster_nodes (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      base_url VARCHAR(500) NOT NULL,
      display_name VARCHAR(255) DEFAULT NULL,
      model_id VARCHAR(255) DEFAULT NULL,
      priority INT NOT NULL DEFAULT 1,
      max_concurrent INT NOT NULL DEFAULT 1,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS marketplace_items (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      item_type VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT NULL,
      content LONGTEXT NOT NULL,
      upvotes INT NOT NULL DEFAULT 0,
      downvotes INT NOT NULL DEFAULT 0,
      is_featured TINYINT NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_marketplace_type (item_type),
      KEY idx_marketplace_featured (is_featured),
      KEY idx_marketplace_user (user_id),
      CONSTRAINT fk_marketplace_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('marketplace_items', 'category'))) {
    await ensurePool().execute('ALTER TABLE marketplace_items ADD COLUMN category VARCHAR(100) DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS marketplace_votes (
      item_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      vote_type TINYINT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (item_id, user_id),
      CONSTRAINT fk_marketplace_votes_item FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_marketplace_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('ollama_cluster_nodes', 'model_id'))) {
    await ensurePool().execute('ALTER TABLE ollama_cluster_nodes ADD COLUMN model_id VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('ollama_cluster_nodes', 'display_name'))) {
    await ensurePool().execute('ALTER TABLE ollama_cluster_nodes ADD COLUMN display_name VARCHAR(255) DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS llama_settings (
      id INT NOT NULL DEFAULT 1,
      base_url VARCHAR(500) DEFAULT NULL,
      model_id VARCHAR(255) DEFAULT NULL,
      name VARCHAR(255) DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    INSERT IGNORE INTO llama_settings (id, base_url, model_id, name, enabled, updated_at)
    VALUES (1, NULL, NULL, NULL, 1, NULL)
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS ollama_models (
      id INT NOT NULL AUTO_INCREMENT,
      model_id VARCHAR(255) NOT NULL,
      label VARCHAR(255) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      context_length VARCHAR(50) DEFAULT NULL,
      pricing VARCHAR(100) DEFAULT NULL,
      speed_hint VARCHAR(100) DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('ollama_models', 'description'))) {
    await ensurePool().execute('ALTER TABLE ollama_models ADD COLUMN description TEXT DEFAULT NULL');
  }
  if (!(await columnExists('ollama_models', 'context_length'))) {
    await ensurePool().execute('ALTER TABLE ollama_models ADD COLUMN context_length VARCHAR(50) DEFAULT NULL');
  }
  if (!(await columnExists('ollama_models', 'pricing'))) {
    await ensurePool().execute('ALTER TABLE ollama_models ADD COLUMN pricing VARCHAR(100) DEFAULT NULL');
  }
  if (!(await columnExists('ollama_models', 'speed_hint'))) {
    await ensurePool().execute('ALTER TABLE ollama_models ADD COLUMN speed_hint VARCHAR(100) DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS model_catalog (
      id VARCHAR(36) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      label VARCHAR(255) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      context_length VARCHAR(50) DEFAULT NULL,
      pricing VARCHAR(100) DEFAULT NULL,
      speed_hint VARCHAR(100) DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS api_providers (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      api_key VARCHAR(500) DEFAULT NULL,
      base_url VARCHAR(500) DEFAULT NULL,
      provider_type VARCHAR(100) DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('api_providers', 'provider_type'))) {
    await ensurePool().execute('ALTER TABLE api_providers ADD COLUMN provider_type VARCHAR(100) DEFAULT NULL');
  }

    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS model_configs (
        id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        provider_id VARCHAR(36) NOT NULL,
        model_id VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        category VARCHAR(50) DEFAULT NULL,
        free_limit INT NOT NULL DEFAULT 0,
        paid_limit INT NOT NULL DEFAULT 0,
        go_limit INT NOT NULL DEFAULT 0,
        plus_limit INT NOT NULL DEFAULT 0,
        beta_limit INT NOT NULL DEFAULT 0,
        plan_access VARCHAR(255) NOT NULL DEFAULT 'free,go,plus,beta',
        role VARCHAR(50) NOT NULL DEFAULT 'all',
        enabled TINYINT NOT NULL DEFAULT 1,
        hidden_from_chat TINYINT NOT NULL DEFAULT 0,
        supports_vision TINYINT NOT NULL DEFAULT 0,
        system_prompt LONGTEXT DEFAULT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_model_configs_provider (provider_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

  if (!(await columnExists('model_configs', 'hidden_from_chat'))) {
    await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN hidden_from_chat TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('model_configs', 'go_limit'))) {
    await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN go_limit INT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('model_configs', 'plus_limit'))) {
    await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN plus_limit INT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('model_configs', 'beta_limit'))) {
    await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN beta_limit INT NOT NULL DEFAULT 0');
  }
   if (!(await columnExists('model_configs', 'plan_access'))) {
     await ensurePool().execute("ALTER TABLE model_configs ADD COLUMN plan_access VARCHAR(255) NOT NULL DEFAULT 'free,go,plus,beta'");
   }
    if (!(await columnExists('model_configs', 'supports_vision'))) {
      await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN supports_vision TINYINT NOT NULL DEFAULT 0');
      // Set supports_vision=1 for known vision-capable models
      await ensurePool().execute(`
        UPDATE model_configs SET supports_vision = 1
        WHERE LOWER(model_id) LIKE '%gpt-4%vision%'
           OR LOWER(model_id) LIKE '%gpt-4-turbo%'
           OR LOWER(model_id) LIKE '%claude-3%'
           OR LOWER(model_id) LIKE '%gemini%'
           OR LOWER(model_id) LIKE '%gpt-4o%'
           OR LOWER(model_id) LIKE '%gpt-4-vision%'
      `);
    }
    if (!(await columnExists('model_configs', 'system_prompt'))) {
      await ensurePool().execute('ALTER TABLE model_configs ADD COLUMN system_prompt LONGTEXT DEFAULT NULL');
    }

   await ensurePool().execute(`
   CREATE TABLE IF NOT EXISTS mcp_servers (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      base_url VARCHAR(500) NOT NULL,
      auth_header VARCHAR(255) DEFAULT NULL,
      api_key VARCHAR(500) DEFAULT NULL,
      headers_json LONGTEXT DEFAULT NULL,
      mcp_json_url VARCHAR(500) DEFAULT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('mcp_servers', 'auth_header'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN auth_header VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('mcp_servers', 'mcp_json_url'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN mcp_json_url VARCHAR(500) DEFAULT NULL');
  }
  if (!(await columnExists('mcp_servers', 'headers_json'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN headers_json LONGTEXT DEFAULT NULL');
  }
  if (!(await columnExists('mcp_servers', 'config_encrypted'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN config_encrypted LONGTEXT DEFAULT NULL');
  }
  if (!(await columnExists('mcp_servers', 'user_id'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN user_id VARCHAR(36) DEFAULT NULL');
  }
  if (!(await columnExists('mcp_servers', 'is_public'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN is_public TINYINT NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('mcp_servers', 'description'))) {
    await ensurePool().execute('ALTER TABLE mcp_servers ADD COLUMN description TEXT DEFAULT NULL');
  }

  if (!(await columnExists('blog_posts', 'meta_title'))) {
    await ensurePool().execute('ALTER TABLE blog_posts ADD COLUMN meta_title VARCHAR(255) DEFAULT NULL');
  }
  if (!(await columnExists('blog_posts', 'meta_description'))) {
    await ensurePool().execute('ALTER TABLE blog_posts ADD COLUMN meta_description TEXT DEFAULT NULL');
  }
   if (!(await columnExists('blog_posts', 'meta_image'))) {
     await ensurePool().execute('ALTER TABLE blog_posts ADD COLUMN meta_image VARCHAR(500) DEFAULT NULL');
   }

   await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      user_agent TEXT DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT NULL,
      last_active_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_sessions_token_hash (token_hash),
      KEY idx_sessions_user_id (user_id),
      KEY idx_sessions_expires_at (expires_at),
      KEY idx_sessions_revoked_at (revoked_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS announcements (
       id INT NOT NULL AUTO_INCREMENT,
       message LONGTEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

   await ensurePool().execute(`
     CREATE TABLE IF NOT EXISTS changelogs (
       id INT NOT NULL AUTO_INCREMENT,
       version VARCHAR(255) NOT NULL,
       content LONGTEXT NOT NULL,
       published TINYINT NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
   `);

    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key_hash VARCHAR(64) NOT NULL,
        count INT NOT NULL DEFAULT 0,
        reset_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key_hash),
        KEY idx_rate_limits_reset_at (reset_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        model_id VARCHAR(255) DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_sessions_user (user_id),
        CONSTRAINT fk_chat_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await columnExists('chat_sessions', 'zyg_id'))) {
      await ensurePool().execute('ALTER TABLE chat_sessions ADD COLUMN zyg_id VARCHAR(36) DEFAULT NULL');
    }

    if (!(await columnExists('chat_sessions', 'is_pinned'))) {
      await ensurePool().execute('ALTER TABLE chat_sessions ADD COLUMN is_pinned TINYINT NOT NULL DEFAULT 0');
    }

    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) NOT NULL,
        session_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        role VARCHAR(20) NOT NULL,
        encrypted_content LONGTEXT NOT NULL,
        iv VARCHAR(255) NOT NULL,
        auth_tag VARCHAR(255) NOT NULL,
        sources LONGTEXT DEFAULT NULL,
        images LONGTEXT DEFAULT NULL,
        user_images LONGTEXT DEFAULT NULL,
        attached_files LONGTEXT DEFAULT NULL,
        reasoning_content LONGTEXT DEFAULT NULL,
        edited TINYINT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_messages_session (session_id),
        KEY idx_messages_user (user_id),
        CONSTRAINT fk_chat_messages_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ban filters for content moderation
    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS ban_filters (
        id INT NOT NULL AUTO_INCREMENT,
        filter_type ENUM('keyword', 'domain_pattern', 'email_pattern') NOT NULL,
        filter_value VARCHAR(255) NOT NULL,
        is_regex TINYINT NOT NULL DEFAULT 0,
        description TEXT DEFAULT NULL,
        active TINYINT NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_ban_filters_value (filter_type, filter_value)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ban logs for tracking ban actions
    await ensurePool().execute(`
      CREATE TABLE IF NOT EXISTS ban_logs (
        id INT NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(36) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        triggered_by VARCHAR(255) DEFAULT NULL,
        admin_id VARCHAR(36) DEFAULT NULL,
        permanent TINYINT NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_ban_logs_user (user_id),
        CONSTRAINT fk_ban_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add ban-related columns to users table if they don't exist
    if (!(await columnExists('users', 'is_banned'))) {
      await ensurePool().execute('ALTER TABLE users ADD COLUMN is_banned TINYINT NOT NULL DEFAULT 0');
    }
    if (!(await columnExists('users', 'ban_reason'))) {
      await ensurePool().execute('ALTER TABLE users ADD COLUMN ban_reason VARCHAR(255) DEFAULT NULL');
    }
    if (!(await columnExists('users', 'ban_expires_at'))) {
      await ensurePool().execute('ALTER TABLE users ADD COLUMN ban_expires_at TEXT DEFAULT NULL');
    }

    // Insert default ban filters if none exist
    const existingFilters = await all('SELECT COUNT(*) as count FROM ban_filters');
    if (existingFilters[0]?.count === 0) {
      const defaultFilters = [
        { type: 'keyword', value: 'drugs', description: 'Block profiles with drug-related keywords' },
        { type: 'keyword', value: 'cocaine', description: 'Block profiles with drug-related keywords' },
        { type: 'keyword', value: 'heroin', description: 'Block profiles with drug-related keywords' },
        { type: 'domain_pattern', value: '.local.domains', description: 'Block suspicious .local.domains pattern' },
        { type: 'domain_pattern', value: '.local', description: 'Block local domain extensions' }
      ];
      
      for (const filter of defaultFilters) {
        await ensurePool().execute(
          `INSERT IGNORE INTO ban_filters (filter_type, filter_value, is_regex, description, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [filter.type, filter.value, 0, filter.description, new Date().toISOString(), new Date().toISOString()]
        );
      }
    }
  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT NULL,
      feature_key VARCHAR(100) NOT NULL,
      duration_days INT NOT NULL DEFAULT 30,
      quota_limit INT NOT NULL DEFAULT 0,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('campaigns', 'quota_limit'))) {
    await ensurePool().execute('ALTER TABLE campaigns ADD COLUMN quota_limit INT NOT NULL DEFAULT 0');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS user_campaigns (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      campaign_id VARCHAR(36) NOT NULL,
      quota_limit INT NOT NULL DEFAULT 0,
      quota_used INT NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_active TINYINT NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_user_campaigns_user (user_id),
      KEY idx_user_campaigns_campaign (campaign_id),
      KEY idx_user_campaigns_active (is_active),
      CONSTRAINT fk_user_campaigns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_campaigns_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('user_campaigns', 'quota_limit'))) {
    await ensurePool().execute('ALTER TABLE user_campaigns ADD COLUMN quota_limit INT NOT NULL DEFAULT 0');
  }

  // ZygAI Reach Tables
  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS reach_campaigns (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_reach_campaigns_user (user_id),
      CONSTRAINT fk_reach_campaigns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS reach_leads (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      campaign_id VARCHAR(36) DEFAULT NULL,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      company VARCHAR(255) DEFAULT NULL,
      source_url TEXT DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new',
      notes TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_reach_leads_user (user_id),
      KEY idx_reach_leads_campaign (campaign_id),
      CONSTRAINT fk_reach_leads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reach_leads_campaign FOREIGN KEY (campaign_id) REFERENCES reach_campaigns(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS user_smtp_settings (
      user_id VARCHAR(36) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INT NOT NULL,
      user VARCHAR(255) DEFAULT NULL,
      pass_encrypted LONGTEXT DEFAULT NULL,
      pass_iv VARCHAR(255) DEFAULT NULL,
      pass_auth_tag VARCHAR(255) DEFAULT NULL,
      secure TINYINT NOT NULL DEFAULT 0,
      from_email VARCHAR(255) DEFAULT NULL,
      from_name VARCHAR(255) DEFAULT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_user_smtp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Set default model for Reach if not exists
  const reachConfig = await get("SELECT * FROM feature_model_settings WHERE feature_key = 'reach'");
  if (!reachConfig) {
    const defaultZygModel = await get("SELECT mc.model_id FROM model_configs mc JOIN api_providers ap ON mc.provider_id = ap.id WHERE ap.provider_type = 'zygai' AND mc.enabled = 1 LIMIT 1");
    if (defaultZygModel) {
      await run(
        'INSERT INTO feature_model_settings (feature_key, provider, model_id, updated_at) VALUES (?, ?, ?, ?)',
        ['reach', 'zygai', defaultZygModel.model_id, new Date().toISOString()]
      );
    }
  }

  // Public API Tables
  if (!(await columnExists('users', 'api_credits'))) {
    await ensurePool().execute('ALTER TABLE users ADD COLUMN api_credits DECIMAL(16, 10) NOT NULL DEFAULT 0.0000000000');
  } else {
    // Ensure precision is high enough for token billing
    await ensurePool().execute('ALTER TABLE users MODIFY COLUMN api_credits DECIMAL(16, 10) NOT NULL DEFAULT 0.0000000000');
  }

  // Grace period: admin-granted temporary plan upgrade
  if (!(await columnExists('users', 'grace_plan'))) {
    await ensurePool().execute("ALTER TABLE users ADD COLUMN grace_plan VARCHAR(20) DEFAULT NULL");
  }
  if (!(await columnExists('users', 'grace_plan_expires_at'))) {
    await ensurePool().execute("ALTER TABLE users ADD COLUMN grace_plan_expires_at TEXT DEFAULT NULL");
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      api_key VARCHAR(255) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      monthly_limit DECIMAL(12, 4) DEFAULT NULL,
      current_monthly_spend DECIMAL(16, 10) NOT NULL DEFAULT 0,
      ip_allowlist TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_api_keys_key (api_key),
      KEY idx_api_keys_user (user_id),
      CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('api_keys', 'monthly_limit'))) {
    await ensurePool().execute('ALTER TABLE api_keys ADD COLUMN monthly_limit DECIMAL(12, 4) DEFAULT NULL');
  }
  if (!(await columnExists('api_keys', 'current_monthly_spend'))) {
    await ensurePool().execute('ALTER TABLE api_keys ADD COLUMN current_monthly_spend DECIMAL(16, 10) NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('api_keys', 'ip_allowlist'))) {
    await ensurePool().execute('ALTER TABLE api_keys ADD COLUMN ip_allowlist TEXT DEFAULT NULL');
  }
  if (!(await columnExists('api_keys', 'last_spend_reset'))) {
    await ensurePool().execute('ALTER TABLE api_keys ADD COLUMN last_spend_reset TEXT DEFAULT NULL');
  }

  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      api_key_id VARCHAR(36) NOT NULL,
      model_id VARCHAR(255) NOT NULL,
      prompt_tokens INT NOT NULL DEFAULT 0,
      completion_tokens INT NOT NULL DEFAULT 0,
      cost DECIMAL(16, 10) NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      KEY idx_usage_user (user_id),
      KEY idx_usage_key (api_key_id),
      CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_usage_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists('api_providers', 'is_healthy'))) {
    await ensurePool().execute('ALTER TABLE api_providers ADD COLUMN is_healthy TINYINT NOT NULL DEFAULT 1');
  }
  if (!(await columnExists('api_providers', 'last_health_check'))) {
    await ensurePool().execute('ALTER TABLE api_providers ADD COLUMN last_health_check TEXT DEFAULT NULL');
  }
  if (!(await columnExists('api_providers', 'failover_provider_id'))) {
   await ensurePool().execute('ALTER TABLE api_providers ADD COLUMN failover_provider_id VARCHAR(36) DEFAULT NULL');
  }

  // Notes Table
  await ensurePool().execute(`
   CREATE TABLE IF NOT EXISTS notes (
     id VARCHAR(36) NOT NULL,
     user_id VARCHAR(36) NOT NULL,
     content TEXT NOT NULL,
     reminder_at TEXT DEFAULT NULL,
     notified TINYINT NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (id),
     KEY idx_notes_user (user_id),
     CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Tasks Table
  await ensurePool().execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      title TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      due_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_tasks_user (user_id),
      CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  };
export { ensurePool as db, run, get, all, initDb };
