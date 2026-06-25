import { get, all } from './db.js';

/**
 * Resolves a model ID (internal 'm-...' or real name) to its full configuration.
 * This is in a separate file to avoid circular dependencies between index.js and reach.js
 */
export const resolveModelConfig = async (modelId) => {
  if (!modelId || typeof modelId !== 'string') return null;

  // Search by internal ID (m-...) or actual model_id
  const config = await get(
      `SELECT mc.model_id as resolved_model_id, mc.supports_vision, mc.role, mc.system_prompt, mc.plan_access,
              ap.id as provider_id, ap.name as provider_name, ap.provider_type, ap.base_url, ap.api_key, ap.is_healthy, ap.failover_provider_id
       FROM model_configs mc
       LEFT JOIN api_providers ap ON mc.provider_id = ap.id
       WHERE (mc.id = ? OR mc.model_id = ?) AND mc.enabled = 1 AND ap.enabled = 1
       LIMIT 1`,
      [modelId, modelId]
  );

  if (!config) {
    // If specific model not found, try ZygRouter as a global fallback
    if (modelId !== 'zygrouter') {
      console.info(`[Router] Model ${modelId} not found. Falling back to ZygRouter.`);
      return resolveModelConfig('zygrouter');
    }
    return null;
  }

  // FAILOVER LOGIC: If provider is unhealthy, try backup
  if (config.is_healthy === 0) {
    console.info(`[Failover] Provider ${config.provider_name} is unhealthy. Attempting failover for ${modelId}...`);
    
    let failoverProvider = null;
    if (config.failover_provider_id) {
      failoverProvider = await get(
        'SELECT id, name, provider_type, base_url, api_key FROM api_providers WHERE id = ? AND enabled = 1 AND is_healthy = 1',
        [config.failover_provider_id]
      );
    }

    // If no explicit failover, look for any healthy provider serving this exact model
    if (!failoverProvider) {
      failoverProvider = await get(
        `SELECT ap.id, ap.name, ap.provider_type, ap.base_url, ap.api_key 
         FROM api_providers ap
         JOIN model_configs mc ON mc.provider_id = ap.id
         WHERE mc.model_id = ? AND ap.enabled = 1 AND ap.is_healthy = 1 AND ap.id != ?
         LIMIT 1`,
        [config.resolved_model_id, config.provider_id]
      );
    }

    if (failoverProvider) {
      console.info(`[Failover] Found healthy backup provider: ${failoverProvider.name}`);
      return {
        modelId: config.resolved_model_id,
        supportsVision: Boolean(config.supports_vision),
        role: config.role,
        systemPrompt: config.system_prompt,
        planAccess: config.plan_access,
        provider: {
          id: failoverProvider.id,
          name: failoverProvider.name,
          type: (failoverProvider.provider_type || '').toLowerCase(),
          baseUrl: failoverProvider.base_url,
          apiKey: failoverProvider.api_key
        }
      };
    } else {
      console.warn(`[Failover] No healthy backup providers found for model ${modelId}.`);
      
      // If even failover fails, and we're not already trying zygrouter, fall back to ZygRouter
      if (modelId !== 'zygrouter') {
        console.info(`[Router] Failover failed for ${modelId}. Redirecting to ZygRouter.`);
        return resolveModelConfig('zygrouter');
      }
    }
  }

  return {
    modelId: config.resolved_model_id,
    supportsVision: Boolean(config.supports_vision),
    role: config.role,
    systemPrompt: config.system_prompt,
    planAccess: config.plan_access,
    provider: {
      id: config.provider_id,
      name: config.provider_name,
      type: (config.provider_type || '').toLowerCase(),
      baseUrl: config.base_url,
      apiKey: config.api_key
    }
  };
};
