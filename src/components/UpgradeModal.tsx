import React from 'react';
import { X, CheckCircle, Sparkles, Rocket } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const { token } = useAuth();

  const handleUpgrade = async (e: React.MouseEvent, plan: 'go' | 'plus') => {
    e.preventDefault();
    
    if (!token) {
      console.error('No authentication token available');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan })
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    }
  };

  const plans = [
    {
      id: 'go' as const,
      name: 'ZygAI Go',
      price: '7€',
      period: '/month',
      icon: Sparkles,
      features: [
        'Access to all AI models',
        'More messages & uploads',
        'More image generations',
        'Bigger conversation memory',
        'Priority response times'
      ],
      buttonClass: 'bg-ink-900 dark:bg-ink-50 dark:text-ink-900 text-white',
      buttonText: 'Get Go'
    },
    {
      id: 'plus' as const,
      name: 'ZygAI Plus',
      price: '15€',
      period: '/month',
      icon: Rocket,
      badge: 'Most Powerful',
      features: [
        'Everything in Go',
        'Advanced reasoning models',
        'Highest message limits',
        'Maximum memory capacity',
        'Pre-release functions access',
        'Priority support'
      ],
      buttonClass: 'bg-saffron-400 text-ink-900 hover:bg-saffron-500',
      buttonText: 'Get Plus'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-3xl border border-ink-100 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-900 overflow-hidden my-8">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-saffron-400 to-saffron-500 p-8 text-white text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
          
          <h2 className="font-display text-3xl font-bold mb-2">
            Elevate your Intelligence
          </h2>
          <p className="text-white/80 max-w-md mx-auto">
            Choose the plan that fits your creative and professional needs.
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {plans.map((plan) => {
              const Icon = plan.icon;
              
              return (
                <div 
                  key={plan.id}
                  className={`flex flex-col rounded-3xl border p-8 transition-all relative ${
                    plan.id === 'plus' 
                      ? 'border-2 border-saffron-400 dark:border-saffron-500 bg-white dark:bg-ink-900 shadow-xl' 
                      : 'border-ink-100 dark:border-ink-800 bg-ink-50/30 dark:bg-ink-900/40 hover:border-saffron-400'
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute top-0 right-8 -translate-y-1/2 bg-saffron-400 text-ink-900 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-glow">
                      {plan.badge}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      plan.id === 'plus' 
                        ? 'bg-saffron-400 text-ink-900' 
                        : 'bg-saffron-100 text-saffron-600'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <h3 className="font-display text-xl font-bold dark:text-ink-50">{plan.name}</h3>
                  </div>
                  
                  <div className="mb-6">
                    <span className="text-4xl font-bold dark:text-ink-50">{plan.price}</span>
                    <span className="text-ink-500 ml-1">{plan.period}</span>
                  </div>
                  
                  <ul className="space-y-4 mb-8 flex-1">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3 text-sm text-ink-600 dark:text-ink-300">
                        <CheckCircle 
                          size={18} 
                          className={`${plan.id === 'plus' ? 'text-saffron-500' : 'text-emerald-500'} flex-shrink-0 mt-0.5`} 
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <button
                    type="button"
                    onClick={(e) => handleUpgrade(e, plan.id)}
                    className={`w-full py-4 rounded-2xl ${plan.buttonClass} font-bold uppercase tracking-widest text-xs transition hover:opacity-90 ${
                      plan.id === 'plus' ? 'hover:shadow-glow' : ''
                    }`}
                  >
                    {plan.buttonText}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-8 w-full text-center text-xs font-bold uppercase tracking-widest text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 transition-colors"
          >
            Stay on Free Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
