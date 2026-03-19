import React, { useState, useEffect, DragEvent } from 'react';
import { useT } from '@/stores/i18n-store';

// Typings for the Electron bridge
declare global {
    interface Window {
        ahri?: {
            agent: {
                openFile: (path: string) => Promise<void>;
                readFile: (path: string) => Promise<string>;
                writeFile: (path: string, content: string) => Promise<{ success: true }>;
                listDir: (path: string) => Promise<string[]>;
                getPaths: () => Promise<{ root: string; data: string; personas: string }>;
            };
            isElectron?: boolean;
        };
    }
}

interface PersonaFileInfo {
    name: string;
    path: string;
    exists: boolean;
    sizeBytes?: number;
    preview?: string;
}

interface PersonaFilesProps {
    personaName: string;
    basePath: string; // e.g. "data/personas/ahri"
}

/**
 * Panel that shows the key files for a persona:
 * - persona.md (identity/system prompt)
 * - memory.json (legacy memory)
 * - knowledge/memoria_legada.md
 * - knowledge/ folder (count of knowledge files)
 *
 * Each file can be: opened in the OS default app, or replaced by dragging a new file.
 */
export function PersonaFilesPanel({ personaName, basePath }: PersonaFilesProps) {
    const t = useT();
    const [files, setFiles] = useState<PersonaFileInfo[]>([]);
    const [knowledgeCount, setKnowledgeCount] = useState(0);
    const [draggingFile, setDraggingFile] = useState<string | null>(null);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        setIsElectron(!!window.ahri?.isElectron);
        loadFileInfo();
    }, [personaName]);

    const loadFileInfo = async () => {
        if (!window.ahri?.agent) return;

        const agent = window.ahri.agent;
        let personaDir = basePath;

        // Resolve absolute path if in Electron
        if (isElectron) {
            try {
                const paths = await agent.getPaths();
                // Ensure we use the correct absolute path for the persona
                // If basePath was passed as relative (e.g. data/personas/ahri), try to map it
                // Or just trust perosnaName prop
                if (paths.personas) {
                    personaDir = `${paths.personas}/${personaName}`;
                    // Normalize slashes for Windows if needed, though shell/fs usually handle forward slashes ok in JS
                    // But let's be safe and let the backend/electron handle it or assume forward slashes work (they do in Node)
                }
            } catch (e) {
                console.warn('Failed to resolve paths:', e);
            }
        } else {
            // Web mode - use relative base
            personaDir = basePath;
        }

        const keyFiles = [
            { name: 'persona.md', path: `${personaDir}/persona.md`, label: 'persona.persona_md' as const },
            { name: 'memory.json', path: `${personaDir}/memory.json`, label: 'persona.memory_json' as const },
            { name: 'memoria_legada.md', path: `${personaDir}/knowledge/memoria_legada.md`, label: 'persona.legacy_memory' as const },
        ];

        const loaded: PersonaFileInfo[] = [];

        for (const kf of keyFiles) {
            try {
                const content = await agent.readFile(kf.path);
                const sizeBytes = new Blob([content]).size;
                // Generate preview: first 120 chars
                const preview = content.slice(0, 150).replace(/\n/g, ' ').trim();
                loaded.push({
                    name: kf.name,
                    path: kf.path,
                    exists: true,
                    sizeBytes,
                    preview: preview.length > 120 ? preview.slice(0, 120) + '…' : preview,
                });
            } catch {
                loaded.push({
                    name: kf.name,
                    path: kf.path,
                    exists: false,
                });
            }
        }

        setFiles(loaded);

        // Count knowledge files
        try {
            const knowledgeFiles = await agent.listDir(`${personaDir}/knowledge`);
            // Filter .md files only
            const mdFiles = knowledgeFiles.filter((f: string) => f.endsWith('.md'));
            setKnowledgeCount(mdFiles.length);
        } catch {
            setKnowledgeCount(0);
        }
    };

    const handleOpenFile = async (filePath: string) => {
        if (window.ahri?.agent) {
            await window.ahri.agent.openFile(filePath);
        }
    };

    const handleOpenFolder = async () => {
        if (window.ahri?.agent) {
            await window.ahri.agent.openFile(basePath);
        }
    };

    const handleDragEnter = (e: DragEvent, fileName: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingFile(fileName);
    };

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingFile(null);
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent, targetFileName: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingFile(null);

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
            const file = droppedFiles[0];
            // Validate file type
            const validExtensions = targetFileName.endsWith('.json')
                ? ['.json']
                : ['.md', '.txt'];

            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            if (!validExtensions.includes(ext)) {
                alert(`Please drop a ${validExtensions.join(' or ')} file`);
                return;
            }

            // Read and save the file
            const reader = new FileReader();
            reader.onload = async () => {
                const content = reader.result as string;
                console.log(`[PersonaFiles] Replacing ${targetFileName} with ${file.name} (${content.length} bytes)`);

                const targetFileInfo = files.find(f => f.name === targetFileName);
                if (!targetFileInfo) {
                    console.error('Target file info not found');
                    return;
                }
                const filePath = targetFileInfo.path;

                try {
                    if (window.ahri?.agent) {
                        await window.ahri.agent.writeFile(filePath, content);
                        alert(`File updated: ${targetFileName}`);
                    } else {
                        console.warn('Agent API not available');
                    }
                } catch (err) {
                    console.error('Failed to write file:', err);
                    alert('Failed to save file');
                }

                await loadFileInfo();
            };
            reader.readAsText(file);
        }
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const fileDescriptions: Record<string, { label: string; desc: string; icon: string }> = {
        'persona.md': {
            label: t('persona.persona_md'),
            desc: t('persona.persona_md_desc'),
            icon: '📝',
        },
        'memory.json': {
            label: t('persona.memory_json'),
            desc: t('persona.memory_json_desc'),
            icon: '🧠',
        },
        'memoria_legada.md': {
            label: t('persona.legacy_memory'),
            desc: t('persona.legacy_memory_desc'),
            icon: '📜',
        },
    };

    return (
        <div className="space-y-4">
            {/* Key persona files */}
            {files.map((file) => {
                const info = fileDescriptions[file.name] || { label: file.name, desc: '', icon: '📄' };
                const isDragging = draggingFile === file.name;

                return (
                    <div
                        key={file.name}
                        className={`persona-file-card ${isDragging ? 'dragging' : ''} ${!file.exists ? 'missing' : ''}`}
                        onDragEnter={(e) => handleDragEnter(e, file.name)}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, file.name)}
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0 mt-0.5">{info.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {info.label}
                                    </p>
                                    {file.exists && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--button-bg)', color: 'var(--text-tertiary)' }}>
                                            {formatSize(file.sizeBytes)}
                                        </span>
                                    )}
                                    {!file.exists && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20">
                                            {t('persona.no_file')}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                    {info.desc}
                                </p>

                                {/* File preview */}
                                {file.exists && file.preview && (
                                    <div className="mt-2 px-3 py-2 rounded text-[11px] font-mono leading-relaxed" style={{ background: 'var(--code-bg)', color: 'var(--text-tertiary)', border: '1px solid var(--glass-border)' }}>
                                        {file.preview}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-1 flex-shrink-0">
                                {file.exists && isElectron && (
                                    <button
                                        onClick={() => handleOpenFile(file.path)}
                                        className="persona-file-action-btn"
                                        title={t('persona.open_file')}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                        <span className="text-[10px]">{t('persona.open_file')}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Drag overlay */}
                        {isDragging && (
                            <div className="persona-file-drag-overlay">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <p className="text-xs font-medium">{t('persona.replace_file')}</p>
                            </div>
                        )}

                        {/* Drop hint */}
                        {!isDragging && (
                            <p className="text-[10px] mt-2 font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
                                {t('persona.replace_file')}
                            </p>
                        )}
                    </div>
                );
            })}

            {/* Knowledge folder card */}
            <div className="persona-file-card">
                <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">📚</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('persona.knowledge')}
                            </p>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--button-bg)', color: 'var(--text-tertiary)' }}>
                                {knowledgeCount} {t('persona.knowledge_count')}
                            </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {t('persona.knowledge_desc')}
                        </p>
                    </div>

                    {isElectron && (
                        <button
                            onClick={handleOpenFolder}
                            className="persona-file-action-btn"
                            title={t('persona.open_folder')}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="text-[10px]">{t('persona.open_folder')}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
