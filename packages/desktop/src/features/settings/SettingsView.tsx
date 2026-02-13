import { useState, useEffect } from 'react';
import { usePersonaStore } from '@/stores/persona-store';
import { getPersonaTheme } from '@ahri/shared';
import { ImageUpload } from './ImageUpload';

interface EditablePersona {
  displayName: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  avatarFile?: File;
  backgroundFile?: File;
}

export function SettingsView() {
  const personas = usePersonaStore((s) => s.personas);
  const activePersona = usePersonaStore((s) => s.activePersona);
  const fetchPersonas = usePersonaStore((s) => s.fetchPersonas);

  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<EditablePersona | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showNewPersonaDialog, setShowNewPersonaDialog] = useState(false);

  const currentPersona = personas.find((p) => p.name === (selectedPersona || activePersona));
  const theme = selectedPersona ? getPersonaTheme(selectedPersona) : getPersonaTheme(activePersona);

  // Initialize editable data when persona changes
  useEffect(() => {
    if (currentPersona) {
      const theme = getPersonaTheme(currentPersona.name);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.description,
        primaryColor: theme.primary,
        secondaryColor: theme.secondary,
      });
      setHasChanges(false);
    }
  }, [currentPersona]);

  const handleFieldChange = (field: keyof EditablePersona, value: string | File) => {
    if (!editedData) return;
    setEditedData({ ...editedData, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!currentPersona || !editedData) return;

    const confirmed = confirm(
      `Save changes to "${currentPersona.display_name}"?\n\n` +
      `This will:\n` +
      `• Update display name and description\n` +
      `• Update theme colors in themes.ts\n` +
      (editedData.avatarFile ? `• Upload new avatar image\n` : '') +
      (editedData.backgroundFile ? `• Upload new background image\n` : '') +
      `\nContinue?`
    );

    if (!confirmed) return;

    try {
      // TODO: Implement actual save to backend
      // This would involve:
      // 1. Upload images to data/assets/
      // 2. Update persona.md YAML frontmatter
      // 3. Update themes.ts with new colors
      // 4. Call backend API to persist changes

      console.log('Saving persona:', {
        personaId: currentPersona.name,
        changes: editedData,
      });

      alert(
        '✅ Save Implementation Guide:\n\n' +
        'To fully implement save, you need to:\n\n' +
        '1. Backend Endpoint:\n' +
        '   POST /personas/{name}/update\n' +
        '   - Update persona.md frontmatter\n' +
        '   - Copy uploaded images to data/assets/\n' +
        '   - Return updated persona data\n\n' +
        '2. Update themes.ts:\n' +
        '   - Read packages/shared/src/themes/index.ts\n' +
        '   - Update colors for this persona\n' +
        '   - Write back to file\n\n' +
        '3. Refresh:\n' +
        '   - Call fetchPersonas() to reload\n' +
        '   - Reset hasChanges flag\n\n' +
        'Changes:\n' + JSON.stringify(editedData, null, 2)
      );

      // Simulate success
      setHasChanges(false);
      await fetchPersonas();
    } catch (error) {
      console.error('Failed to save persona:', error);
      alert('Failed to save changes. Check console for details.');
    }
  };

  const handleCancel = () => {
    if (currentPersona) {
      const theme = getPersonaTheme(currentPersona.name);
      setEditedData({
        displayName: currentPersona.display_name,
        description: currentPersona.description,
        primaryColor: theme.primary,
        secondaryColor: theme.secondary,
      });
      setHasChanges(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPersona) return;

    const confirmed = confirm(
      `⚠️ DELETE PERSONA\n\n` +
      `Are you sure you want to delete "${currentPersona.display_name}"?\n\n` +
      `This will permanently remove:\n` +
      `• Persona definition (persona.md)\n` +
      `• Avatar and background images\n` +
      `• All associated memories and chat history\n` +
      `• Theme configuration\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Type the persona name to confirm deletion.`
    );

    if (!confirmed) return;

    const nameConfirm = prompt(
      `Type "${currentPersona.display_name}" to confirm deletion:`
    );

    if (nameConfirm !== currentPersona.display_name) {
      alert('Deletion cancelled: name did not match.');
      return;
    }

    try {
      // TODO: Implement actual delete
      // This would involve:
      // 1. DELETE /personas/{name}
      // 2. Remove from data/personas/{name}/
      // 3. Remove images from data/assets/
      // 4. Update themes.ts (remove entry)
      // 5. If active persona, switch to default

      console.log('Deleting persona:', currentPersona.name);

      alert(
        '✅ Delete Implementation Guide:\n\n' +
        'To fully implement delete, you need to:\n\n' +
        '1. Backend Endpoint:\n' +
        '   DELETE /personas/{name}\n' +
        '   - Remove data/personas/{name}/ folder\n' +
        '   - Delete avatar/background from data/assets/\n' +
        '   - Clean up memories/sessions\n\n' +
        '2. Update themes.ts:\n' +
        '   - Remove persona entry from themes object\n\n' +
        '3. Handle active persona:\n' +
        '   - If deleted persona is active, switch to "ahri"\n' +
        '   - Reload persona list\n\n' +
        `Would delete: ${currentPersona.name}`
      );

      // Simulate success
      setSelectedPersona(null);
      await fetchPersonas();
    } catch (error) {
      console.error('Failed to delete persona:', error);
      alert('Failed to delete persona. Check console for details.');
    }
  };

  const handleNewPersona = () => {
    alert(
      '✅ New Persona Flow:\n\n' +
      '1. Show dialog with fields:\n' +
      '   - Internal name (slug: lowercase, no spaces)\n' +
      '   - Display name\n' +
      '   - Description\n' +
      '   - Avatar upload (required)\n' +
      '   - Background upload (required)\n' +
      '   - Primary color picker\n' +
      '   - Secondary color picker\n\n' +
      '2. Validation:\n' +
      '   - Name must be unique\n' +
      '   - Name must be valid slug (a-z, 0-9, _, -)\n' +
      '   - Images must be provided\n\n' +
      '3. Backend:\n' +
      '   POST /personas/create\n' +
      '   - Create data/personas/{name}/\n' +
      '   - Generate persona.md with YAML\n' +
      '   - Copy images to data/assets/\n' +
      '   - Add entry to themes.ts\n\n' +
      '4. UI:\n' +
      '   - Reload personas list\n' +
      '   - Select newly created persona\n' +
      '   - Show success message'
    );
  };

  // Live preview theme (uses edited colors if changed)
  const previewTheme = editedData
    ? {
        ...theme,
        primary: editedData.primaryColor,
        secondary: editedData.secondaryColor,
        shadow: `rgba(${parseInt(editedData.primaryColor.slice(1, 3), 16)}, ${parseInt(editedData.primaryColor.slice(3, 5), 16)}, ${parseInt(editedData.primaryColor.slice(5, 7), 16)}, 0.3)`,
      }
    : theme;

  return (
    <div className="flex h-full w-full">
      {/* Left Column - Persona List */}
      <aside className="w-64 border-r border-agent-border surface-0 flex flex-col">
        <div className="p-3 border-b border-agent-border">
          <h2 className="text-sm font-semibold text-agent-text-primary">PERSONAS</h2>
          <p className="text-xs text-agent-text-tertiary font-mono mt-0.5">
            {personas.length} total
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {personas.map((p) => {
            const isSelected = selectedPersona === p.name || (!selectedPersona && p.name === activePersona);
            const personaTheme = getPersonaTheme(p.name);

            return (
              <button
                key={p.name}
                onClick={() => {
                  if (hasChanges) {
                    const confirmed = confirm('You have unsaved changes. Discard them?');
                    if (!confirmed) return;
                  }
                  setSelectedPersona(p.name);
                }}
                className={`
                  w-full p-2 mb-1 flex items-center gap-2 transition-colors text-left
                  ${isSelected
                    ? 'surface-2 border-l-2 text-agent-text-primary'
                    : 'surface-1 hover:surface-2 text-agent-text-secondary'
                  }
                `}
                style={
                  isSelected
                    ? { borderLeftColor: personaTheme.primary }
                    : undefined
                }
              >
                <div
                  className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0"
                  style={{ borderColor: personaTheme.primary + '40' }}
                >
                  <img
                    src={`/${personaTheme.avatar}`}
                    alt={p.display_name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.display_name}</p>
                  <p className="text-xs text-agent-text-tertiary font-mono truncate">
                    {p.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-2 border-t border-agent-border">
          <button
            onClick={handleNewPersona}
            className="agent-button-primary w-full text-xs py-2"
          >
            + New Persona
          </button>
        </div>
      </aside>

      {/* Center Column - Editor */}
      <main className="flex-1 overflow-y-auto p-6">
        {currentPersona && editedData ? (
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-agent-text-primary mb-1 flex items-center gap-2">
                Edit Persona
                {hasChanges && (
                  <span className="px-2 py-0.5 text-xs bg-agent-warning/20 text-agent-warning border border-agent-warning/30 rounded-sm font-mono">
                    UNSAVED
                  </span>
                )}
              </h1>
              <p className="text-sm text-agent-text-tertiary">
                Configure persona details, appearance, and behavior
              </p>
            </div>

            {/* Basic Info */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-agent-text-primary mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-agent-accent"></span>
                BASIC INFORMATION
              </h3>
              <div className="surface-1 p-4 space-y-3">
                <div>
                  <label className="block text-xs text-agent-text-tertiary font-mono mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    className="agent-input w-full"
                    value={editedData.displayName}
                    onChange={(e) => handleFieldChange('displayName', e.target.value)}
                    placeholder="Enter display name..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-agent-text-tertiary font-mono mb-1">
                    Internal Name (ID) - Read Only
                  </label>
                  <input
                    type="text"
                    className="agent-input w-full font-mono opacity-60"
                    value={currentPersona.name}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs text-agent-text-tertiary font-mono mb-1">
                    Description
                  </label>
                  <textarea
                    className="agent-input w-full resize-none"
                    rows={3}
                    value={editedData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder="Brief description of the persona..."
                  />
                </div>
              </div>
            </section>

            {/* Assets */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-agent-text-primary mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-agent-accent"></span>
                ASSETS
              </h3>
              <div className="surface-1 p-4 space-y-4">
                <ImageUpload
                  label="Avatar Image"
                  currentImage={theme.avatar}
                  onImageSelect={(file) => handleFieldChange('avatarFile', file)}
                  previewShape="circle"
                  previewSize={{ width: 64, height: 64 }}
                />

                <ImageUpload
                  label="Background Image"
                  currentImage={theme.background}
                  onImageSelect={(file) => handleFieldChange('backgroundFile', file)}
                  previewShape="rectangle"
                  previewSize={{ width: 128, height: 80 }}
                />
              </div>
            </section>

            {/* Colors */}
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-agent-text-primary mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-agent-accent"></span>
                THEME COLORS
              </h3>
              <div className="surface-1 p-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-agent-text-tertiary font-mono mb-1">
                    Primary Color *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editedData.primaryColor}
                      onChange={(e) => handleFieldChange('primaryColor', e.target.value)}
                      className="w-10 h-10 rounded-sm border border-agent-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editedData.primaryColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                          handleFieldChange('primaryColor', val);
                        }
                      }}
                      className="agent-input flex-1 font-mono text-xs uppercase"
                      placeholder="#RRGGBB"
                      maxLength={7}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-agent-text-tertiary font-mono mb-1">
                    Secondary Color *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editedData.secondaryColor}
                      onChange={(e) => handleFieldChange('secondaryColor', e.target.value)}
                      className="w-10 h-10 rounded-sm border border-agent-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editedData.secondaryColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                          handleFieldChange('secondaryColor', val);
                        }
                      }}
                      className="agent-input flex-1 font-mono text-xs uppercase"
                      placeholder="#RRGGBB"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-agent-text-tertiary mt-2 px-1 font-mono">
                💡 Tip: Changes are previewed in real-time on the right panel
              </p>
            </section>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-agent-border">
              <button
                onClick={handleSave}
                disabled={!hasChanges}
                className={`agent-button-primary flex-1 ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                disabled={!hasChanges}
                className={`agent-button-ghost ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="agent-button-ghost text-agent-error hover:bg-agent-error/10"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-agent-text-tertiary">Select a persona to edit</p>
          </div>
        )}
      </main>

      {/* Right Column - Live Preview */}
      <aside className="w-80 border-l border-agent-border surface-0 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-agent-text-primary mb-1">LIVE PREVIEW</h3>
          <p className="text-xs text-agent-text-tertiary font-mono">
            See changes in real-time
          </p>
        </div>

        {currentPersona && editedData && (
          <div className="space-y-4">
            {/* Avatar Preview */}
            <div className="surface-1 p-4 text-center">
              <div
                className="w-24 h-24 rounded-full overflow-hidden border-4 mx-auto mb-3 transition-all"
                style={{ borderColor: previewTheme.primary + '40' }}
              >
                <img
                  src={`/${theme.avatar}`}
                  alt={editedData.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              <h4 className="text-sm font-semibold text-agent-text-primary">
                {editedData.displayName}
              </h4>
              <p className="text-xs text-agent-text-tertiary font-mono">
                @{currentPersona.name}
              </p>
            </div>

            {/* Color Swatches */}
            <div className="surface-1 p-4">
              <p className="text-xs text-agent-text-tertiary font-mono mb-2">COLORS</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div
                    className="w-full h-12 rounded-sm border border-agent-border transition-colors duration-200"
                    style={{ backgroundColor: editedData.primaryColor }}
                  />
                  <p className="text-xs text-agent-text-tertiary font-mono mt-1">Primary</p>
                  <p className="text-xs text-agent-text-primary font-mono">{editedData.primaryColor}</p>
                </div>
                <div>
                  <div
                    className="w-full h-12 rounded-sm border border-agent-border transition-colors duration-200"
                    style={{ backgroundColor: editedData.secondaryColor }}
                  />
                  <p className="text-xs text-agent-text-tertiary font-mono mt-1">Secondary</p>
                  <p className="text-xs text-agent-text-primary font-mono">{editedData.secondaryColor}</p>
                </div>
              </div>
            </div>

            {/* Message Preview */}
            <div className="surface-1 p-4">
              <p className="text-xs text-agent-text-tertiary font-mono mb-3">MESSAGE SAMPLE</p>
              <div className="flex items-start gap-2">
                <div
                  className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all duration-200"
                  style={{ borderColor: previewTheme.primary + '40' }}
                >
                  <img
                    src={`/${theme.avatar}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <p
                    className="text-xs font-medium mb-1 transition-colors duration-200"
                    style={{ color: previewTheme.primary }}
                  >
                    {editedData.displayName}
                  </p>
                  <div
                    className="px-3 py-2 rounded-xl text-xs border transition-all duration-200"
                    style={{
                      backgroundColor: previewTheme.primary + '0D',
                      borderColor: previewTheme.primary + '40',
                      boxShadow: `0 0 15px ${previewTheme.shadow}`,
                    }}
                  >
                    Hello! This is a preview of how my messages will look in chat with the new colors.
                  </div>
                </div>
              </div>
            </div>

            {/* Change Indicator */}
            {hasChanges && (
              <div className="surface-1 p-3 border-l-2 border-l-agent-warning">
                <p className="text-xs text-agent-warning font-mono">
                  ⚠️ Unsaved Changes
                </p>
                <p className="text-xs text-agent-text-tertiary mt-1">
                  {editedData.avatarFile && '• New avatar uploaded\n'}
                  {editedData.backgroundFile && '• New background uploaded\n'}
                  Click "Save" to apply changes or "Cancel" to discard.
                </p>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
