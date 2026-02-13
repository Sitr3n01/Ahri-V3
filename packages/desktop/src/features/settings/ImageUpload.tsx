import { useState, useRef, DragEvent } from 'react';

interface ImageUploadProps {
  label: string;
  currentImage: string;
  onImageSelect: (file: File) => void;
  previewShape?: 'circle' | 'rectangle';
  previewSize?: { width: number; height: number };
}

export function ImageUpload({
  label,
  currentImage,
  onImageSelect,
  previewShape = 'circle',
  previewSize = { width: 64, height: 64 },
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onImageSelect(file);
      } else {
        alert('Please upload an image file (PNG, JPG, WEBP)');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onImageSelect(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <label className="block text-xs text-agent-text-tertiary font-mono mb-2">
        {label}
      </label>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          className={`
            flex-shrink-0 overflow-hidden border-2 border-agent-border
            ${previewShape === 'circle' ? 'rounded-full' : 'rounded-sm'}
          `}
          style={{ width: previewSize.width, height: previewSize.height }}
        >
          <img
            src={`/${currentImage}`}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Upload Area */}
        <div
          className={`
            flex-1 border-2 border-dashed rounded-sm p-4 transition-all cursor-pointer
            ${isDragging
              ? 'border-agent-accent bg-agent-accent/10'
              : 'border-agent-border hover:border-agent-accent/50 hover:bg-agent-bg-tertiary'
            }
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <svg
              className="mx-auto mb-2 text-agent-text-tertiary"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-xs text-agent-text-secondary font-mono">
              {isDragging ? 'Drop image here' : 'Click or drag image'}
            </p>
            <p className="text-xs text-agent-text-tertiary font-mono mt-1">
              PNG, JPG, WEBP
            </p>
          </div>
        </div>
      </div>
      <p className="text-xs text-agent-text-tertiary mt-1 font-mono">
        Current: {currentImage}
      </p>
    </div>
  );
}
