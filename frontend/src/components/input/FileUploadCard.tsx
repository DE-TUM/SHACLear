import { useRef, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { useFileUpload } from '@/hooks/useFileUpload';
import { cn } from '@/lib/utils';
import { TurtleCodeMirror } from './TurtleCodeMirror';

const ACCEPTED = ['.ttl', '.rdf'];

export function FileUploadCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadedFile, setUploadedFile } = useAppStore();
  const upload = useFileUpload();
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      upload.reset();
      toast.error('Unsupported file type', { description: 'Please upload a .ttl or .rdf file.' });
      return;
    }
    upload.mutate(file);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  if (uploadedFile) {
    const ext = (uploadedFile.name.split('.').pop() ?? 'ttl').toUpperCase();
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 h-[68px] dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/40">
            <span className="text-[0.7rem] font-bold text-brand-600 dark:text-brand-100">{ext}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate text-zinc-900 dark:text-zinc-100">{uploadedFile.name}</div>
            <div className="text-[0.72rem] text-zinc-500 dark:text-zinc-400">Loaded · review and edit below before generating</div>
          </div>
          <button
            onClick={() => setUploadedFile(null)}
            aria-label="Remove file"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 transition-colors dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <TurtleCodeMirror
          value={uploadedFile.turtle}
          onChange={(next) => setUploadedFile({ ...uploadedFile, turtle: next })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Supported formats: .ttl · .rdf
      </p>
      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        disabled={upload.isPending}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all min-h-[260px]',
          isDragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
            : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800',
          upload.isPending && 'opacity-60 cursor-wait',
        )}
      >
        <Upload className={cn(
          'h-9 w-9 mb-3 transition-colors',
          isDragging ? 'text-brand-600' : 'text-zinc-400 dark:text-zinc-500',
        )} />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {upload.isPending
            ? 'Uploading…'
            : isDragging
              ? 'Drop the file to upload'
              : 'Drop a file here or click to browse'}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          .ttl or .rdf
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".ttl,.rdf"
        onChange={handlePick}
        className="hidden"
      />
    </div>
  );
}
