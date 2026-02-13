/**
 * SessionsView - Chat session history for mobile
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chat-store';
import { MessageCircle, Trash2, Edit2, Loader2 } from 'lucide-react';

export function SessionsView() {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isLoading = useChatStore((s) => s.isLoading);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadSession = useChatStore((s) => s.loadSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const createSession = useChatStore((s) => s.createSession);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSelectSession = async (sessionId: number) => {
    await loadSession(sessionId);
    navigate('/');
  };

  const handleNewChat = async () => {
    await createSession();
    navigate('/');
  };

  const handleDelete = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deletar esta sessão?')) {
      await deleteSession(sessionId);
    }
  };

  const handleRename = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(sessionId);
    const session = sessions.find((s) => s.id === sessionId);
    setEditTitle(session?.title || '');
  };

  const saveRename = async (sessionId: number) => {
    if (editTitle.trim()) {
      await renameSession(sessionId, editTitle.trim());
    }
    setEditingId(null);
  };

  if (isLoading && sessions.length === 0) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-white/90">Sessões</h1>
            <p className="text-white/50 text-sm mt-1">
              {sessions.length} conversas salvas
            </p>
          </div>
          <button
            onClick={handleNewChat}
            className="px-4 py-2 bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent)] rounded-xl text-white font-medium shadow-lg shadow-[var(--theme-glow)] active:scale-95 transition-all"
          >
            + Novo
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="p-4 space-y-3">
        {sessions.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle size={48} className="text-white/30 mx-auto mb-4" />
            <p className="text-white/50">Nenhuma sessão ainda</p>
            <p className="text-white/30 text-sm mt-2">
              Crie uma nova conversa para começar
            </p>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isEditing = editingId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={`glass-dark rounded-2xl p-4 transition-all active:scale-98 ${
                  isActive ? 'ring-2 ring-[var(--theme-primary)]' : ''
                }`}
              >
                {/* Title Row */}
                <div className="flex items-start justify-between mb-2">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => saveRename(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(session.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 bg-black/30 text-white px-2 py-1 rounded outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 className="text-white font-medium flex-1 line-clamp-1">
                      {session.title}
                    </h3>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={(e) => handleRename(session.id, e)}
                      className="text-white/50 hover:text-white/80 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      className="text-red-400/50 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span>
                    {new Date(session.updated_at).toLocaleDateString('pt-BR')}
                  </span>
                  {session.message_count !== undefined && (
                    <span>{session.message_count} mensagens</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
