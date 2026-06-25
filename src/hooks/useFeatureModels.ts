import { useEffect, useState } from 'react';
import { FeatureModelConfig } from '@/types/admin';
import { API_BASE } from '@/utils/apiBase';

export const useFeatureModels = () => {
  const [models, setModels] = useState<FeatureModelConfig[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/feature-models`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.settings)) {
          setModels(data.settings);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch feature models:', err);
      });
  }, []);

  return models;
};
