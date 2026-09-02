import type { DocumentListQuery } from '@lemuria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DocumentRecord } from '@/features/customers/api';

export interface ExpiringDocument {
  id: string;
  documentCode: string;
  type: string;
  title: string;
  expiresOn: string;
  daysToExpiry: number;
  customerId: string;
  customerName: string;
  customerCode: string;
  customerPhone: string;
}

export const useDocuments = (query: Partial<DocumentListQuery>) =>
  useQuery({
    queryKey: ['documents', 'list', query],
    queryFn: () => api.list<DocumentRecord>('/documents', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useExpiringDocuments = (withinDays = 180) =>
  useQuery({
    queryKey: ['documents', 'expiring', withinDays],
    queryFn: () => api.get<ExpiringDocument[]>('/documents/expiring', { withinDays }),
  });

export interface UploadArgs {
  file: File;
  customerId?: string;
  entityType?: string;
  entityId?: string;
  type: string;
  title: string;
  expiresOn?: string;
  referenceNumber?: string;
  replacesDocumentId?: string;
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, ...meta }: UploadArgs) => {
      const form = new FormData();
      form.append('file', file);
      for (const [key, value] of Object.entries(meta)) {
        if (value !== undefined && value !== '') form.append(key, String(value));
      }
      return api.upload<DocumentRecord>('/documents', form);
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      if (vars.customerId) {
        void qc.invalidateQueries({ queryKey: ['customers', 'detail', vars.customerId] });
      }
    },
  });
}

export function useVerifyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.post(`/documents/${id}/verify`, { verified }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

/**
 * Downloads through the authorised API route and hands the bytes to the
 * browser. A plain <a href> would 401: the access token lives in memory, not
 * in a cookie the browser would attach.
 */
export async function downloadDocument(id: string): Promise<void> {
  const { blob, fileName } = await api.download(`/documents/${id}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the click has already been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
