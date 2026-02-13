/**
 * PersonasView - Persona selection grid for mobile
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersonaStore } from '@/stores/persona-store';
import { useChatStore } from '@/stores/chat-store';
import { Check, Loader2 } from 'lucide-react';

export function PersonasView() {
  const personas = usePersonaStore((s) => s.personas);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const isLoading = usePersonaStore((s) => s.isLoading);
  const loadPersonas = usePersonaStore((s) => s.loadPersonas);
  const activatePersona = usePersonaStore((s) => s.activatePersona);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const navigate = useNavigate();

  useEffect(() => {
    if (personas.length === 0) {
      loadPersonas();
    }
  }, [personas.length, loadPersonas]);

  const handleSelect = async (personaName: string) => {
    if (activePersona?.name === personaName) {
      navigate('/');
      return;
    }

    await activatePersona(personaName);
    clearMessages();
    navigate('/');
  };

  if (isLoading && personas.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="text-white/50 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-4 z-10">
        <h1 className="text-2xl font-light text-white/90">Personas</h1>
        <p className="text-white/50 text-sm mt-1">
          {personas.length} disponíveis
        </p>
      </div>

      {/* Personas Grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {personas.map((persona) => {
          const isActive = activePersona?.name === persona.name;

          return (
            <button
              key={persona.name}
              onClick={() => handleSelect(persona.name)}
              className={`glass-dark rounded-2xl p-4 transition-all active:scale-95 relative ${
                isActive ? 'ring-2 ring-[var(--theme-primary)]' : ''
              }`}
            >
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-[var(--theme-primary)] rounded-full flex items-center justify-center">
                  <Check size={16} className="text-white" />
                </div>
              )}

              {/* Avatar */}
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-accent)] flex items-center justify-center">
                <span className="text-3xl">✨</span>
              </div>

              {/* Name */}
              <h3 className="text-white font-medium text-center mb-1">
                {persona.name}
              </h3>

              {/* Tagline */}
              <p className="text-white/50 text-xs text-center line-clamp-2">
                {persona.tagline || 'AI Companion'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
