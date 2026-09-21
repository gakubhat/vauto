import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteDriver, deleteRider, getMe } from './api';

/**
 * Rendered only when ALLOW_ADMIN_DELETE=true on the server. The server also
 * refuses the request when the flag is off, so hiding the button is a
 * convenience, not the guard.
 */
export function DeleteUserButton({
  kind,
  id,
  name,
}: {
  kind: 'rider' | 'driver';
  id: string;
  name: string;
}) {
  const [allowed, setAllowed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getMe()
      .then((me) => setAllowed(Boolean((me as { allowAdminDelete?: boolean }).allowAdminDelete)))
      .catch(() => setAllowed(false));
  }, []);

  if (!allowed) return null;

  async function doDelete() {
    setBusy(true);
    try {
      if (kind === 'rider') await deleteRider(id);
      else await deleteDriver(id);
      navigate(kind === 'rider' ? '/riders' : '/drivers');
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button className="danger" onClick={() => setConfirming(true)}>
        Delete {kind}
      </button>
    );
  }

  return (
    <span>
      <button className="danger" disabled={busy} onClick={() => void doDelete()}>
        {busy ? 'Deleting…' : `Yes, permanently delete ${name || kind}`}
      </button>{' '}
      <button disabled={busy} onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
