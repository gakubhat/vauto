import { useParams, Link } from 'react-router-dom';
import { RecoverPanel } from './RecoverPanel';

/**
 * Deep-linkable diagnosis for one phone number. Sessions links here so the
 * office can jump straight from a suspicious row to what is wrong with it.
 */
export function Recover() {
  const { phone } = useParams();

  if (!phone) return <p>No phone given.</p>;

  return (
    <>
      <h1>
        Recover <span className="muted">{phone}</span>
      </h1>
      <p className="muted">
        <Link to="/sessions">← back to sessions</Link>
      </p>
      <RecoverPanel phone={decodeURIComponent(phone)} />
    </>
  );
}
