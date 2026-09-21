import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRiders } from './api';

interface Rider {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string;
  rating_avg: number;
  created_at: string;
}

export function Riders() {
  const [rows, setRows] = useState<Rider[]>([]);
  const [q, setQ] = useState('');

  async function load() {
    setRows((await getRiders(q ? `?q=${encodeURIComponent(q)}` : '')) as Rider[]);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <h1>Riders</h1>
      <div className="row">
        <input placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => void load()}>Search</button>
      </div>
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
        </tbody>
      </table>
    </>
  );
}
