import { useState } from 'react';
import { login } from './api';

export function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(phone, password);
      window.location.reload();
    } catch {
      setError('Invalid credentials');
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>VAuto Admin</h1>
      <form onSubmit={submit} className="panel">
        <div className="row">
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="row">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="primary" type="submit">
          Login
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </div>
  );
}
