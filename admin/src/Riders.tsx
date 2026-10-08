import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getRiders } from './api';
import { Notice, useApi } from './ui';

interface Rider {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string;
  rating_avg: number;
  created_at: string;
}

export function Riders() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  const { data: rows, error, loading, reload } = useApi<Rider[]>(
    () => getRiders(q ? `?q=${encodeURIComponent(q)}` : '') as Promise<Rider[]>,
    [q],
  );

  function search() {
    const next = new URLSearchParams(params);
    if (qInput.trim()) next.set('q', qInput.trim());
    else next.delete('q');
    setParams(next);
  }

  return (
    <>
      <h1>Riders</h1>
      <div className="row">
        <input
          placeholder="Search name or phone"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
          }}
        />
        <button onClick={search}>Search</button>
      </div>

      <Notice error={error} loading={loading} onRetry={reload} />

      {rows && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Language</th>
              <th>Rating</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/riders/${r.id}`}>{r.name ?? '—'}</Link>
                </td>
                <td>{r.phone}</td>
                <td>{r.preferred_language}</td>
                <td>{r.rating_avg.toFixed(1)}</td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No riders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
