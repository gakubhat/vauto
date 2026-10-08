import { useCallback, useEffect, useState } from 'react';

/**
 * Fetch-and-render state for a page or panel.
 *
 * Every admin screen loads remote data; without this each one hand-rolled its
 * own loading flag, and a failed request silently looked like "Loading…"
 * forever. This makes the error visible and retryable.
 *
 * `deps` drives re-fetching (filters, ids, pages) - include everything the
 * fetch closure reads.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError((e as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Renders nothing while fine; a spinner while loading; a retryable error. */
export function Notice({
  error,
  loading,
  onRetry,
}: {
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
}) {
  if (loading) return <p className="muted">Loading…</p>;
  if (error)
    return (
      <p className="notice-bad">
        Could not load: {error}{' '}
        {onRetry && (
          <button onClick={() => void onRetry()} style={{ marginLeft: 8 }}>
            Retry
          </button>
        )}
      </p>
    );
  return null;
}

/** Inline result of a mutation: success in green, failure in red. */
export function ActionNote({ note }: { note: string | null }) {
  if (!note) return null;
  const bad = /error|could not|failed|must be/i.test(note);
  return <p className={bad ? 'notice-bad' : 'notice-ok'}>{note}</p>;
}
