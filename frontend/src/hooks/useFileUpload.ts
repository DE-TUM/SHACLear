import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { extractErrorLines } from '@/lib/parseErrorLines';
import { humanizeError } from '@/lib/humanizeError';

export function useFileUpload() {
  const { setUploadedFile, setValidationError, setErrorLines } = useAppStore();

  return useMutation({
    mutationFn: (file: File) => api.convertRdf(file),
    onMutate: () => {
      setErrorLines([]);
      toast.loading('Uploading and validating…', { id: 'upload', description: undefined });
    },
    onSuccess: ({ turtle, filename }) => {
      setUploadedFile({ name: filename, turtle });
      setValidationError(null);
      toast.success(`Loaded ${filename}`, { id: 'upload', description: undefined });
    },
    onError: (err: Error) => {
      const lines = extractErrorLines(err.message);
      const { title, description } = humanizeError(err.message);
      setValidationError(description ? `${title}. ${description}` : title);
      setErrorLines(lines);
      toast.error(title, {
        id: 'upload',
        description,
        duration: 10_000,
        onDismiss: () => useAppStore.getState().setErrorLines([]),
        onAutoClose: () => useAppStore.getState().setErrorLines([]),
      });
    },
  });
}
