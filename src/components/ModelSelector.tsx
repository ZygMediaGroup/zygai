import React from 'react';
import { ChevronDown, Cpu } from 'lucide-react';
import { ModelOption } from '@/types';

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (value: string) => void;
  latencyMap?: Record<string, number>;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ models, value, onChange }) => {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-ink-200 bg-white/80 px-4 pr-10 text-sm font-semibold text-ink-900 shadow-sm transition focus:border-saffron-400 focus:ring-2 focus:ring-saffron-400/20 focus:outline-none sm:h-11 dark:border-ink-700 dark:bg-ink-800/80 dark:text-ink-50"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-ink-500 dark:text-ink-400">
        <Cpu size={16} strokeWidth={1.5} />
        <ChevronDown size={16} strokeWidth={1.5} />
      </div>
    </div>
  );
};

export default ModelSelector;
