/**
 * BottomNav - Mobile bottom navigation bar
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Clock, Settings } from 'lucide-react';

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', icon: MessageCircle, label: 'Chat' },
    { path: '/personas', icon: Users, label: 'Personas' },
    { path: '/sessions', icon: Clock, label: 'Sessões' },
    { path: '/settings', icon: Settings, label: 'Config' }
  ];

  return (
    <nav className="h-16 border-t border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="flex items-center justify-around h-full px-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all ${
                isActive
                  ? 'text-[var(--theme-primary)] scale-105'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-xs mt-1 font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
