'use client';

import { useState } from 'react';

export default function HomePage() {
  const [documentText, setDocumentText] = useState('');
  const [documentType, setDocumentType] = useState('Clinical Summary Log');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setResult(null);

    try {
      const response = await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText, documentType }),
      });

      const data = await response.json();

      if (!response.ok) {
        const stageLabel = data.stage ? ` [${data.stage}]` : '';
        setError(`${data.error || 'Processing failed.'}${stageLabel}`);
        setErrorDetails(data.details ?? null);
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
      setErrorDetails(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          IntelliDoc Ingestion Matrix
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Submit document text for edge-AI parsing and verification pipeline storage.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Document type
          <input
            type="text"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none ring-blue-500 focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Document text
          <textarea
            required
            rows={10}
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder="Paste clinical or operational document content..."
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-blue-500 focus:ring-2"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Processing…' : 'Run ingestion pipeline'}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <p>{error}</p>
          {errorDetails && (
            <p className="mt-2 font-mono text-xs text-red-400/90">{errorDetails}</p>
          )}
        </div>
      )}

      {result && (
        <pre className="overflow-auto rounded-md border border-slate-700 bg-slate-950 p-4 text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
