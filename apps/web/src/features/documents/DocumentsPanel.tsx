import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, expirySeverity } from '@lemuria/shared';
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  FileText,
  Lock,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Badge,
  Button,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  Select,
  type BadgeTone,
} from '@/components/ui';
import type { DocumentRecord } from '@/features/customers/api';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { downloadDocument, useDeleteDocument, useUploadDocument, useVerifyDocument } from './api';

const TYPE_LABEL: Record<string, string> = {
  PASSPORT: 'Passport',
  VISA: 'Visa',
  PHOTO: 'Photograph',
  IDENTITY_PROOF: 'Identity proof',
  QUOTATION: 'Quotation',
  ITINERARY: 'Itinerary',
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  TICKET: 'Ticket',
  TRAVEL_DOCUMENT: 'Travel document',
  OTHER: 'Other',
};

const SEVERITY_TONE: Record<string, BadgeTone> = {
  CRITICAL: 'danger',
  URGENT: 'hot',
  WARN: 'warm',
  INFO: 'neutral',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsPanel({
  customerId,
  documents,
  restricted,
}: {
  customerId: string;
  documents: DocumentRecord[];
  restricted: boolean;
}) {
  const { can } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = useVerifyDocument();
  const remove = useDeleteDocument();

  const handleDownload = async (doc: DocumentRecord) => {
    setBusyId(doc.id);
    setError(null);
    try {
      await downloadDocument(doc.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not download that document.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <CardHeader
        title="Documents"
        description={restricted ? 'Some documents are hidden by your access level' : undefined}
        action={
          can('document.upload') ? (
            <Button size="sm" leadingIcon={<Upload className="size-4" aria-hidden />} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          ) : null
        }
      />

      {error && (
        <p role="alert" className="border-b border-danger-100 bg-danger-50 px-5 py-2 text-sm text-danger-600">
          {error}
        </p>
      )}

      {restricted && (
        <p className="flex items-center gap-2 border-b border-ink-200 bg-ink-50/70 px-5 py-2.5 text-xs text-ink-500">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Passport, visa and identity documents need additional access. Ask a manager if you need them.
        </p>
      )}

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Passports, tickets and receipts uploaded here stay with the customer."
        />
      ) : (
        <ul className="divide-y divide-ink-200/70">
          {documents.map((doc) => {
            const severity = expirySeverity(doc.daysToExpiry);
            return (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <FileText className="size-4" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink-900">{doc.title}</p>
                    <Badge tone="neutral">{TYPE_LABEL[doc.type] ?? doc.type}</Badge>
                    {doc.version > 1 && <Badge tone="neutral">v{doc.version}</Badge>}
                    {doc.verifiedAt && (
                      <Badge tone="success">
                        <BadgeCheck className="size-3" aria-hidden />
                        Verified
                      </Badge>
                    )}
                    {severity && (
                      <Badge tone={SEVERITY_TONE[severity] ?? 'warm'}>
                        <AlertTriangle className="size-3" aria-hidden />
                        {doc.daysToExpiry !== null && doc.daysToExpiry < 0
                          ? 'Expired'
                          : `Expires ${formatDate(doc.expiresOn)}`}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {doc.fileName}
                    <span className="mx-1.5 text-ink-300">·</span>
                    {formatBytes(doc.sizeBytes)}
                    {doc.referenceNumberMasked && (
                      <>
                        <span className="mx-1.5 text-ink-300">·</span>
                        <span className="font-mono">{doc.referenceNumberMasked}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${doc.title}`}
                    loading={busyId === doc.id}
                    onClick={() => void handleDownload(doc)}
                  >
                    <Download className="size-4" aria-hidden />
                  </Button>

                  {can('document.upload') && !doc.verifiedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => verify.mutate({ id: doc.id, verified: true })}
                    >
                      Verify
                    </Button>
                  )}

                  {can('document.delete') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${doc.title}`}
                      className="text-ink-400 hover:text-danger-600"
                      onClick={() => remove.mutate(doc.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        customerId={customerId}
      />
    </>
  );
}

export function UploadDocumentModal({
  open,
  onClose,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
}) {
  const { can } = useAuth();
  const upload = useUploadDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<string>('PASSPORT');
  const [title, setTitle] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canUploadSensitive = can('document.read.sensitive');
  const typeOptions = DOCUMENT_TYPES.filter(
    (t) => canUploadSensitive || !['PASSPORT', 'VISA', 'IDENTITY_PROOF'].includes(t),
  ).map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }));

  const needsExpiry = type === 'PASSPORT' || type === 'VISA';
  const needsReference = type === 'PASSPORT' || type === 'VISA';

  const reset = () => {
    setFile(null);
    setTitle('');
    setExpiresOn('');
    setReferenceNumber('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickFile = (next: File | null) => {
    setError(null);
    if (next && next.size > MAX_DOCUMENT_BYTES) {
      setError('That file is larger than 25 MB.');
      setFile(null);
      return;
    }
    setFile(next);
    // Default the title to the filename without its extension.
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Give the document a title.');
      return;
    }
    setError(null);
    try {
      await upload.mutateAsync({
        file,
        customerId,
        type,
        title: title.trim(),
        ...(expiresOn ? { expiresOn } : {}),
        ...(referenceNumber ? { referenceNumber: referenceNumber.trim() } : {}),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that document.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Upload a document"
      description="Passports and identity documents are access-controlled and every read is logged."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button loading={upload.isPending} onClick={() => void submit()}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="doc-file" className="mb-1.5 block text-xs font-medium text-ink-700">
            File <span className="text-danger-500">*</span>
          </label>
          <input
            id="doc-file"
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className={cn(
              'w-full rounded-lg border border-ink-300 bg-white text-sm text-ink-700',
              'file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-ink-100',
              'file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200',
            )}
          />
          <p className="mt-1 text-xs text-ink-500">PDF, image or Office document, up to 25 MB.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Document type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={typeOptions}
          />
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Passport scan"
          />
        </div>

        {(needsExpiry || needsReference) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {needsExpiry && (
              <Input
                label="Expires on"
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
                hint="Drives the 12 and 6 month alerts"
              />
            )}
            {needsReference && (
              <Input
                label={type === 'PASSPORT' ? 'Passport number' : 'Visa number'}
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                hint="Stored masked; only the last four digits are kept readable"
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
