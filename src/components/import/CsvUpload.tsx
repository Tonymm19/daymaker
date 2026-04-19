'use client';

/**
 * DAYMAKER CONNECT — CSV Upload Component
 *
 * Drag-and-drop + file picker for LinkedIn CSV imports.
 * Reusable on both the onboarding page and dashboard.
 *
 * States: idle → uploading → parsing → writing → complete/error
 */

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { getAuth } from '@/lib/firebase/config';
import JSZip from 'jszip';

// ============================================
// Types
// ============================================

type UploadState = 'idle' | 'uploading' | 'complete' | 'error';

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  batchId: string;
  total: number;
  categorized?: number;
}

interface CsvUploadProps {
  onComplete?: (result: ImportResult) => void;
}

// ============================================
// Component
// ============================================

export default function CsvUpload({ onComplete }: CsvUploadProps) {
  const { user } = useAuth();
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [recatState, setRecatState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [recatProgress, setRecatProgress] = useState('');
  const [recatError, setRecatError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!user) {
      setError('You must be signed in to import contacts.');
      setState('error');
      return;
    }

    // Validate file type
    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (!isCsv && !isZip) {
      setError('Please upload a .csv or .zip file from your LinkedIn data export.');
      setState('error');
      return;
    }

    setState('uploading');
    setProgress('Reading file...');
    setError('');
    setResult(null);

    try {
      // Get auth token
      const auth = getAuth();
      if (!auth?.currentUser) {
        throw new Error('Not authenticated');
      }
      const idToken = await auth.currentUser.getIdToken();

      let uploadFile = file;

      if (isZip) {
        setProgress('Extracting zip file...');
        const zip = await JSZip.loadAsync(file);
        
        let connectionsFile = zip.file('Connections.csv');
        if (!connectionsFile) {
          const allFiles = Object.values(zip.files);
          const found = allFiles.find(f => f.name.endsWith('Connections.csv'));
          if (found) {
            connectionsFile = found;
          }
        }

        if (!connectionsFile) {
          throw new Error("No Connections.csv found in this zip file. Make sure you're uploading the LinkedIn data export.");
        }

        const csvBlob = await connectionsFile.async('blob');
        uploadFile = new File([csvBlob], 'Connections.csv', { type: 'text/csv' });
      }

      setProgress('Importing contacts...');

      // Upload to API
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      // Phase 2: Categorize — loop until the server reports zero remaining so
      // the whole network gets categorized in a single import flow, not just
      // the first batch.
      let totalCategorized = 0;
      try {
        let catTarget = 0;
        for (let round = 0; round < 200; round++) {
          const catResponse = await fetch('/api/ai/categorize-batch', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: 200 }),
          });

          const catData = await catResponse.json();
          if (!catResponse.ok) {
            data.errors = [...(data.errors || []), `Categorization API error: ${catData.error}`];
            break;
          }

          const done = typeof catData.categorized === 'number' ? catData.categorized : 0;
          const remaining = typeof catData.remaining === 'number' ? catData.remaining : 0;
          totalCategorized += done;
          catTarget = totalCategorized + remaining;

          if (catData.errors?.length) data.errors = [...(data.errors || []), ...catData.errors];

          setProgress(
            catTarget > 0
              ? `Categorizing contacts... ${totalCategorized.toLocaleString()} / ${catTarget.toLocaleString()}`
              : 'Categorizing contacts...'
          );

          if (remaining <= 0) break;
          // Stop if a round made no progress so we don't spin forever.
          if (done === 0) {
            data.errors = [...(data.errors || []), 'Categorization stopped early: a round completed without progress.'];
            break;
          }
        }
      } catch (e) {
        console.error('Categorization failed', e);
        data.errors = [...(data.errors || []), 'Categorization failed or timed out.'];
      }
      data.categorized = totalCategorized;

      // Phase 3: Embeddings — same loop pattern. Previously only ran one
      // round, which left 90%+ of large networks without a search index.
      try {
        let totalEmbedded = 0;
        let embedTarget = 0;
        for (let round = 0; round < 200; round++) {
          const embedResponse = await fetch('/api/ai/embed', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ limit: 200 }),
          });
          const embedData = await embedResponse.json();
          if (!embedResponse.ok) {
            data.errors = [...(data.errors || []), `Embedding API error: ${embedData.error}`];
            break;
          }

          const done = typeof embedData.embedded === 'number' ? embedData.embedded : 0;
          const remaining = typeof embedData.remaining === 'number' ? embedData.remaining : 0;
          totalEmbedded += done;
          embedTarget = totalEmbedded + remaining;

          if (embedData.errors?.length) data.errors = [...(data.errors || []), ...embedData.errors];

          setProgress(
            embedTarget > 0
              ? `Building AI search index... ${totalEmbedded.toLocaleString()} / ${embedTarget.toLocaleString()}`
              : 'Building AI search index...'
          );

          if (remaining <= 0) break;
          if (done === 0) {
            data.errors = [...(data.errors || []), 'Embedding stopped early: a round completed without progress.'];
            break;
          }
        }
      } catch (embedErr) {
        console.error('Embedding failed', embedErr);
        data.errors = [...(data.errors || []), 'Embedding sequence failed.'];
      }

      setResult(data);
      setState('complete');
      setProgress('');
      onComplete?.(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed. Please try again.';
      setError(message);
      setState('error');
      setProgress('');
    }
  }, [user, onComplete]);

  // --- Drag & Drop Handlers ---
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // --- File Input Handler ---
  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleReset = () => {
    setState('idle');
    setResult(null);
    setError('');
    setProgress('');
    setRecatState('idle');
    setRecatProgress('');
    setRecatError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Re-categorize every contact from scratch. Only exposed after an import
  // completes — this is a prompt-change recovery tool, not a casual action,
  // because it re-runs ~$3-5 of Claude calls on the full network.
  const handleRecategorizeAll = useCallback(async () => {
    if (!user || !result) return;

    const total = result.total;
    const confirmed = window.confirm(
      `This will re-categorize all ${total.toLocaleString()} contacts using improved AI. This costs approximately $3-5 in API credits. Continue?`
    );
    if (!confirmed) return;

    setRecatState('running');
    setRecatProgress('Resetting categories...');
    setRecatError('');

    try {
      const auth = getAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const resetRes = await fetch('/api/ai/categorize-reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resetRes.ok) {
        const errPayload = await resetRes.json().catch(() => ({ error: resetRes.statusText }));
        throw new Error(errPayload.error || `Reset failed (HTTP ${resetRes.status})`);
      }

      let totalCategorized = 0;
      let catTarget = 0;
      for (let round = 0; round < 200; round++) {
        const catResponse = await fetch('/api/ai/categorize-batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 200 }),
        });
        const catData = await catResponse.json();
        if (!catResponse.ok) throw new Error(catData.error || 'Categorization failed');

        const done = typeof catData.categorized === 'number' ? catData.categorized : 0;
        const remaining = typeof catData.remaining === 'number' ? catData.remaining : 0;
        totalCategorized += done;
        catTarget = totalCategorized + remaining;

        setRecatProgress(
          catTarget > 0
            ? `Re-categorizing... ${totalCategorized.toLocaleString()} / ${catTarget.toLocaleString()}`
            : 'Re-categorizing...'
        );

        if (remaining <= 0) break;
        if (done === 0) break;
      }

      setRecatState('done');
      setRecatProgress('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-categorization failed';
      setRecatError(message);
      setRecatState('error');
      setRecatProgress('');
    }
  }, [user, result]);

  return (
    <div>
      {/* Upload Zone */}
      {state === 'idle' && (
        <div
          className="card"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            cursor: 'pointer',
            border: dragOver ? '2px solid var(--orange)' : undefined,
            background: dragOver ? 'var(--orange-dim)' : undefined,
            padding: '40px 24px',
            textAlign: 'center',
            transition: 'all 0.2s',
          }}
        >
          {/* Upload Icon */}
          <div style={{ marginBottom: '12px' }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--orange)"
              strokeWidth="1.5"
              style={{ margin: '0 auto' }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
            Drop your LinkedIn data export here
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Accepts .zip or .csv files from LinkedIn&apos;s Download Your Data
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            onChange={handleFileInput}
            style={{ display: 'none' }}
            id="csv-file-input"
          />
        </div>
      )}

      {/* Uploading State */}
      {state === 'uploading' && (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
            {progress}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
            This may take a moment for large networks
          </div>
        </div>
      )}

      {/* Complete State */}
      {state === 'complete' && result && (
        <div className="card" style={{ padding: '24px' }}>
          {/* Success Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--green-dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                Import Complete
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {result.total} contacts processed
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--darker)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 700, color: 'var(--green)' }}>
                {result.imported}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>New</div>
            </div>
            <div style={{ background: 'var(--darker)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 700, color: 'var(--blue)' }}>
                {result.updated}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Updated</div>
            </div>
            {result.categorized !== undefined ? (
              <div style={{ background: 'var(--darker)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 700, color: 'var(--amber)' }}>
                  {result.categorized}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Categorized</div>
              </div>
            ) : (
              <div style={{ background: 'var(--darker)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 700, color: 'var(--text2)' }}>
                  {result.skipped}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Skipped</div>
              </div>
            )}
          </div>

          {/* Errors / Warnings */}
          {result.errors.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--amber)', marginBottom: '4px' }}>
                Warnings ({result.errors.length})
              </div>
              <div
                style={{
                  maxHeight: '100px',
                  overflow: 'auto',
                  fontSize: '11px',
                  color: 'var(--muted)',
                  background: 'var(--darker)',
                  padding: '8px',
                  borderRadius: '6px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {result.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            </div>
          )}

          {/* Import Another */}
          <button className="btn" onClick={handleReset} style={{ width: '100%' }}>
            Import Another CSV
          </button>

          {/* Re-categorize All — prompt-change recovery. Only offered here, not on
              the dashboard, so users don't casually re-run a paid operation. */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            {recatState === 'running' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--orange)', fontWeight: 600 }}>
                <div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                <span>{recatProgress || 'Re-categorizing...'}</span>
              </div>
            ) : recatState === 'done' ? (
              <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>
                Re-categorization complete.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', lineHeight: 1.4 }}>
                  Changed the categorization prompt? Re-run categorization across your full network (~$3-5 in API credits).
                </div>
                <button
                  onClick={handleRecategorizeAll}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Re-categorize all contacts
                </button>
                {recatState === 'error' && recatError && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--red)' }}>
                    {recatError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--red-dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--red)' }}>
              Import Failed
            </div>
          </div>
          <div className="auth-error" style={{ marginBottom: '16px' }}>{error}</div>
          <button className="btn" onClick={handleReset} style={{ width: '100%' }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
