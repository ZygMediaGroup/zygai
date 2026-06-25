import { useState, useEffect } from 'react';
import { API_BASE } from '@/utils/apiBase';

export interface Model {
  id: string;
  name: string;
  provider: string;
  providerType?: string;
  hiddenFromChat?: boolean;
  label?: string;
  description?: string;
  contextLength?: string;
  pricing?: string;
  speedHint?: string;
  planAccess?: string[];
}


export function useModels() {
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/models`)
      .then((res) => res.json())
      .then((data) => {
        if (data.models) setModels(data.models);
      })
      .catch((err) => console.error('Failed to fetch models:', err));
  }, []);

  return models;
}
