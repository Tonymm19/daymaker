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

      setProgress('Parsing & importing contacts...');

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

      setProgress('Categorizing contacts... (this may take a minute)');
      try {
        const catResponse = await fetch('/api/ai/categorize-batch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        
        const catData = await catResponse.json();
        if (catResponse.ok) {
          data.categorized = catData.categorized;
          if (catData.errors && catData.errors.length > 0) {
            data.errors = [...(data.errors || []), ...catData.errors];
          }

          // Phase 3: Embeddings Generation
          setProgress('Generating embeddings... (this makes AI search lightning fast)');
          try {
            const embedResponse = await fetch('/api/ai/embed', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            });
            const embedData = await embedResponse.json();
            if (!embedResponse.ok) {
              data.errors = [...(data.errors || []), `Embedding API error: ${embedData.error}`];
            }
          } catch (embedErr) {
            console.error('Embedding failed', embedErr);
            data.errors = [...(data.errors || []), 'Embedding sequence failed.'];
          }

        } else {
          data.errors = [...(data.errors || []), `Categorization API error: ${catData.error}`];
        }
      } catch (e) {
        console.error('Categorization failed', e);
        data.errors = [...(data.errors || []), 'Categorization failed or timed out.'];
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
