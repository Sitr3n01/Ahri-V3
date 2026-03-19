# Ahri V3 — Persona Design System

**Data:** 2026-03-12
**Versão:** 3.1.0
**Propósito:** Documentação completa do sistema de design de personas para preservação e referência futura.

---

## Visão Geral

O sistema de personas do V3 combina:
1. **`PersonaDrawer.tsx`** — Componente React de seleção visual
2. **CSS classes** — Sistema de animações e estilos
3. **`persona-store.ts`** — Estado global (Zustand)
4. **`themes/index.ts`** — 16 temas definidos em `@ahri/shared`

O resultado é uma seleção de persona com preview de background, animação de entrada/saída, shimmer no hover, barra ativa pulsante, e badge "Ativa".

---

## 1. PersonaDrawer.tsx — Componente Completo

```tsx
import { useState, useRef, useEffect } from 'react';
import { usePersonaStore } from '@/stores/persona-store';
import { getPersonaTheme } from '@ahri/shared';

/**
 * Per-persona image position config.
 * Adjust these to center on each character's eyes/face.
 * Format: CSS object-position value (e.g., "50% 30%" means center horizontally, 30% from top)
 */
const PERSONA_IMAGE_POSITIONS: Record<string, string> = {
    ahri: '50% 20%',
    kafka: '50% 20%',
    robin: '50% 20%',
    furina: '50% 20%',
    sparkle: '50% 20%',
    frieren: '50% 20%',
    herta: '50% 20%',
    shorekeeper: '50% 20%',
    cantarella: '50% 20%',
    maomao: '50% 20%',
    'yae miko': '50% 20%',
    rakan: '50% 20%',
    'march 7th': '50% 20%',
    cartethyia: '50% 20%',
    cyrene: '50% 20%',
    'carlotta montelli': '50% 20%',
};

function getImagePosition(name: string): string {
    return PERSONA_IMAGE_POSITIONS[name.toLowerCase()] || '50% 20%';
}

export function PersonaDrawer() {
    const activePersona = usePersonaStore((s) => s.activePersona);
    const personas = usePersonaStore((s) => s.personas);
    const activatePersona = usePersonaStore((s) => s.activatePersona);
    const isLoading = usePersonaStore((s) => s.isLoading);

    const [isOpen, setIsOpen] = useState(false);
    const [hoveredPersona, setHoveredPersona] = useState<string | null>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const activeTheme = getPersonaTheme(activePersona);
    const activePersonaData = personas.find((p) => p.name === activePersona);

    // Close drawer when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSelectPersona = (name: string) => {
        activatePersona(name);
        setIsOpen(false);
    };

    if (isLoading) {
        return (
            <div className="persona-drawer-skeleton">
                <div className="persona-drawer-skeleton-bar" />
            </div>
        );
    }

    if (personas.length === 0) {
        return (
            <div className="text-xs text-white/30 py-3 text-center">
                Nenhuma persona encontrada
            </div>
        );
    }

    return (
        <div className="persona-drawer-wrapper" ref={drawerRef}>
            {/* Toggle Button — shows active persona preview */}
            <button
                className="persona-drawer-toggle"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    '--drawer-color': activeTheme.primary,
                    '--drawer-shadow': activeTheme.shadow,
                    '--drawer-glow': activeTheme.glow,
                } as React.CSSProperties}
            >
                <div className="persona-drawer-toggle-preview">
                    <img
                        src={`/${activeTheme.background}`}
                        alt={activePersonaData?.display_name || activePersona}
                        className="persona-drawer-toggle-img"
                        style={{ objectPosition: getImagePosition(activePersona) }}
                        draggable={false}
                    />
                    <div className="persona-drawer-toggle-overlay" />
                    <div className="persona-drawer-toggle-info">
                        <span className="persona-drawer-toggle-name">
                            {activePersonaData?.display_name || activePersona}
                        </span>
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className={`persona-drawer-chevron ${isOpen ? 'open' : ''}`}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>
            </button>

            {/* Drawer Content */}
            <div
                className={`persona-drawer-content ${isOpen ? 'open' : ''}`}
                ref={contentRef}
                style={{
                    maxHeight: isOpen ? '420px' : '0px',
                }}
            >
                <div className="persona-drawer-list">
                    {personas.map((p) => {
                        const pTheme = getPersonaTheme(p.name);
                        const isActive = p.name === activePersona;
                        const isHovered = hoveredPersona === p.name;

                        return (
                            <button
                                key={p.name}
                                className={`persona-drawer-item ${isActive ? 'active' : ''}`}
                                onClick={() => handleSelectPersona(p.name)}
                                onMouseEnter={() => setHoveredPersona(p.name)}
                                onMouseLeave={() => setHoveredPersona(null)}
                                style={{
                                    '--item-color': pTheme.primary,
                                    '--item-shadow': pTheme.shadow,
                                    '--item-glow': pTheme.glow,
                                } as React.CSSProperties}
                            >
                                {/* Ultra-wide image */}
                                <div className="persona-drawer-item-image-container">
                                    <img
                                        src={`/${pTheme.background}`}
                                        alt={p.display_name}
                                        className="persona-drawer-item-image"
                                        style={{ objectPosition: getImagePosition(p.name) }}
                                        draggable={false}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                        }}
                                    />
                                    {/* Gradient overlay */}
                                    <div className="persona-drawer-item-gradient" />

                                    {/* Active indicator glow bar */}
                                    {isActive && <div className="persona-drawer-item-active-bar" />}

                                    {/* Name overlay */}
                                    <div className="persona-drawer-item-info">
                                        <span className="persona-drawer-item-name">{p.display_name}</span>
                                        {isActive && (
                                            <div className="persona-drawer-item-badge">
                                                <div className="persona-drawer-item-badge-dot" />
                                                <span>Ativa</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Hover shimmer effect */}
                                    {(isHovered && !isActive) && (
                                        <div className="persona-drawer-item-shimmer" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
```

---

## 2. CSS Classes — Persona Drawer

Todas as classes `persona-drawer-*` estão definidas em `packages/desktop/src/styles/globals.css`.

### Wrapper e Toggle

```css
/* Wrapper */
.persona-drawer-wrapper {
  position: relative;
  width: 100%;
}

/* Toggle button — shows active persona preview */
.persona-drawer-toggle {
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--drawer-color, var(--persona-primary)) 35%, transparent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--drawer-shadow, var(--persona-shadow)) 25%, transparent);
  cursor: pointer;
  transition: all 0.25s ease;
  background: transparent;
  padding: 0;
}

.persona-drawer-toggle:hover {
  border-color: color-mix(in srgb, var(--drawer-color, var(--persona-primary)) 65%, transparent);
  box-shadow: 0 0 24px color-mix(in srgb, var(--drawer-shadow, var(--persona-shadow)) 45%, transparent);
  transform: translateY(-1px);
}

/* Preview container */
.persona-drawer-toggle-preview {
  position: relative;
  width: 100%;
  height: 56px;
  overflow: hidden;
}

/* Background image */
.persona-drawer-toggle-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Dark gradient overlay */
.persona-drawer-toggle-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(0, 0, 0, 0.55) 0%,
    rgba(0, 0, 0, 0.20) 100%
  );
}

/* Name + chevron info row */
.persona-drawer-toggle-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.persona-drawer-toggle-name {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.02em;
  text-transform: capitalize;
}

/* Animated chevron */
.persona-drawer-chevron {
  color: rgba(255, 255, 255, 0.7);
  transition: transform 0.25s ease;
  flex-shrink: 0;
}

.persona-drawer-chevron.open {
  transform: rotate(180deg);
}
```

### Drawer Content (Expandable)

```css
/* Collapsible drawer */
.persona-drawer-content {
  overflow-y: auto;
  overflow-x: hidden;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 0 10px 10px;
  scrollbar-width: thin;
}

.persona-drawer-content::-webkit-scrollbar { width: 3px; }
.persona-drawer-content::-webkit-scrollbar-thumb {
  background: var(--persona-primary);
  border-radius: 2px;
  opacity: 0.5;
}

/* List container */
.persona-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}
```

### Persona Item Cards

```css
/* Individual persona item button */
.persona-drawer-item {
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: transparent;
  transition: all 0.2s ease;
  position: relative;
}

.persona-drawer-item:hover {
  transform: translateX(2px);
}

.persona-drawer-item.active {
  outline: 1px solid color-mix(in srgb, var(--item-color, var(--persona-primary)) 55%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--item-shadow, var(--persona-shadow)) 35%, transparent);
}

/* Image container (wide-cropped) */
.persona-drawer-item-image-container {
  position: relative;
  width: 100%;
  height: 44px;
  overflow: hidden;
}

/* Background image cropped to face area */
.persona-drawer-item-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Gradient overlay */
.persona-drawer-item-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.65) 0%,
    rgba(0, 0, 0, 0.25) 60%,
    rgba(0, 0, 0, 0.45) 100%
  );
}
```

### Active Indicator, Badge, Shimmer

```css
/* Active glow bar on left edge */
.persona-drawer-item-active-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--item-color, var(--persona-primary));
  box-shadow: 0 0 8px var(--item-color, var(--persona-primary));
  animation: activeBarPulse 2s ease-in-out infinite;
}

@keyframes activeBarPulse {
  0%, 100% { opacity: 0.8; }
  50%       { opacity: 1.0; box-shadow: 0 0 12px var(--item-color); }
}

/* Name + badge container */
.persona-drawer-item-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.persona-drawer-item-name {
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
  letter-spacing: 0.02em;
  text-transform: capitalize;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* "Ativa" badge */
.persona-drawer-item-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid color-mix(in srgb, var(--item-color, var(--persona-primary)) 50%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 9px;
  color: var(--item-color, var(--persona-primary));
  font-weight: 600;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.persona-drawer-item-badge-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--item-color, var(--persona-primary));
  animation: badgeDotPulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes badgeDotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(0.8); }
}

/* Shimmer effect on hover */
.persona-drawer-item-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    120deg,
    transparent 25%,
    rgba(255, 255, 255, 0.08) 50%,
    transparent 75%
  );
  background-size: 200% 100%;
  animation: shimmerSlide 0.6s ease-out forwards;
  pointer-events: none;
}

@keyframes shimmerSlide {
  from { background-position: 200% center; }
  to   { background-position: -200% center; }
}
```

### Skeleton Loader

```css
.persona-drawer-skeleton {
  border-radius: 10px;
  height: 56px;
  background: var(--agent-bg-tertiary);
  overflow: hidden;
  position: relative;
}

.persona-drawer-skeleton-bar {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.05) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: skeletonShimmer 1.5s ease-in-out infinite;
}

@keyframes skeletonShimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
```

---

## 3. VN Utility Classes

```css
/* VN Card — glass surface with persona-tinted border */
.vn-card {
  background: rgba(14, 11, 24, 0.78);
  border: 1px solid color-mix(in srgb, var(--persona-primary) 35%, transparent);
  border-radius: 14px;
  box-shadow:
    0 0 24px color-mix(in srgb, var(--persona-shadow) 30%, transparent),
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(50px) saturate(160%);
}

/* VN Border — adds persona border to any element */
.vn-border {
  border: 1px solid color-mix(in srgb, var(--persona-primary) 40%, transparent);
}

/* VN Gradient Text — persona gradient on headings */
.vn-gradient-text {
  background: linear-gradient(135deg, var(--persona-primary) 0%, var(--persona-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* VN Firefly Particle */
@keyframes fireflyFloat {
  0%   { transform: translateY(0px)   translateX(0px);   opacity: 0.2; }
  20%  { transform: translateY(-18px) translateX(12px);  opacity: 0.7; }
  40%  { transform: translateY(-8px)  translateX(-14px); opacity: 0.4; }
  60%  { transform: translateY(-28px) translateX(6px);   opacity: 0.8; }
  80%  { transform: translateY(-12px) translateX(-8px);  opacity: 0.5; }
  100% { transform: translateY(0px)   translateX(0px);   opacity: 0.2; }
}

.vn-firefly {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--persona-primary);
  box-shadow: 0 0 6px var(--persona-glow), 0 0 14px var(--persona-shadow);
  animation: fireflyFloat var(--ff-dur, 8s) ease-in-out infinite var(--ff-delay, 0s);
  pointer-events: none;
}
```

---

## 4. persona-store.ts — Estado Global

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersonaSummary, SpotifyContext } from '@ahri/shared';
import { getPersonaTheme, type PersonaTheme } from '@ahri/shared';
import { api } from '@/api/client';

interface PersonaState {
  activePersona: string;
  personas: PersonaSummary[];
  isLoading: boolean;
  backgroundOpacity: number; // 0-100 (percentage)
  spotifyContext: SpotifyContext | null;
  isSyncingSpotify: boolean;

  setActivePersona: (name: string) => void;
  fetchPersonas: () => Promise<void>;
  activatePersona: (name: string) => Promise<void>;
  getTheme: () => PersonaTheme;
  setBackgroundOpacity: (opacity: number) => void;
  fetchSpotifyContext: () => Promise<void>;
  syncPersonaByMusic: () => Promise<string | null>;
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      activePersona: 'ahri',
      personas: [],
      isLoading: false,
      backgroundOpacity: 40, // Default 40%
      spotifyContext: null,
      isSyncingSpotify: false,
      // ... métodos
    }),
    {
      name: 'persona-preferences',
      partialize: (state) => ({ backgroundOpacity: state.backgroundOpacity }),
    }
  )
);
```

### API do Store
- `activatePersona(name)` → POST `/personas/activate/{name}`, atualiza `activePersona`
- `fetchPersonas()` → GET `/personas/list`, popula `personas[]`
- `setBackgroundOpacity(0-100)` → apenas local state (persisted)
- `syncPersonaByMusic()` → POST `/spotify/sync`, retorna `{ switched, persona }`
- `getTheme()` → shortcut para `getPersonaTheme(activePersona)`

---

## 5. Temas — @ahri/shared (16 personas)

**Localização:** `packages/shared/src/themes/index.ts`

```typescript
export interface PersonaTheme {
  primary: string;        // Hex — cor principal
  secondary: string;      // Hex — cor secundária
  shadow: string;         // rgba — para box-shadows
  glow: string;           // rgba — para glow effects
  avatar: string;         // "{name}_1.png"
  background: string;     // "background_{name}.png"
  backgroundMobile: string; // "background_{name}_mobile.png"
}
```

| Persona | Primary | Secondary |
|---|---|---|
| ahri | `#d8b4d8` | `#e9cce9` |
| kafka | `#800020` | `#A52A2A` |
| robin | `#9370DB` | `#E6E6FA` |
| furina | `#4169E1` | `#B0C4DE` |
| sparkle | `#FF69B4` | `#FFB6C1` |
| frieren | `#C0C0C0` | `#E8E8E8` |
| herta | `#8B4513` | `#DEB887` |
| shorekeeper | `#20B2AA` | `#AFEEEE` |
| cantarella | `#483D8B` | `#9370DB` |
| maomao | `#228B22` | `#90EE90` |
| yae miko | `#FF69B4` | `#FFE4E1` |
| rakan | `#DAA520` | `#FFD700` |
| march 7th | `#FF6B81` | `#FFDEE2` |
| cartethyia | `#4B0082` | `#9932CC` |
| cyrene | `#00CED1` | `#E0FFFF` |
| carlotta montelli | `#C71585` | `#FF82AB` |

---

## 6. Como Estender

### Adicionar Nova Persona

1. **Criar arquivo de tema** em `packages/shared/src/themes/index.ts`:
```typescript
nova_persona: {
  primary: '#HEXCOLOR',
  secondary: '#HEXCOLOR2',
  shadow: 'rgba(r, g, b, 0.3)',
  glow: 'rgba(r, g, b, 0.5)',
  avatar: 'nova_persona_1.png',
  background: 'background_nova_persona.png',
  backgroundMobile: 'background_nova_persona_mobile.png',
},
```

2. **Adicionar image position** em `PersonaDrawer.tsx`:
```typescript
nova_persona: '50% 20%',  // Ajustar y para centralizar no rosto
```

3. **Criar pasta de dados:** `data/personas/nova_persona/`
4. **Copiar imagens** para `data/assets/`
5. **Criar `persona.md`** com frontmatter YAML + bio

### Ajustar Posição de Crop do Rosto

Editar `PERSONA_IMAGE_POSITIONS` em `PersonaDrawer.tsx`:
```typescript
// "X% Y%" — X = horizontal, Y = vertical (distância do topo)
// Y menor = mais próximo do topo (rosto na parte superior da imagem)
ahri: '50% 15%',   // Centralizado, 15% do topo
kafka: '60% 25%',  // Ligeiramente à direita, 25% do topo
```

### Alterar Animações

- **Active bar pulse:** `@keyframes activeBarPulse` em globals.css
- **Badge dot pulse:** `@keyframes badgeDotPulse` em globals.css
- **Shimmer:** `@keyframes shimmerSlide` em globals.css
- **Duração drawer:** `transition: max-height 0.35s cubic-bezier(...)` em `.persona-drawer-content`

---

*Gerado em 2026-03-12 — Preservar antes de refatorações visuais*
