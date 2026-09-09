import { useState, type FormEvent } from 'react';
import { verifyPasscode } from '../../services/guestlist.ts';
import styles from './SignIn.module.css';

interface SignInProps {
  onSignedIn: () => void;
}

export default function SignIn({ onSignedIn }: SignInProps) {
  const [passcode, setPasscodeInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setStatus('submitting');
    setErrorMessage('');
    try {
      const ok = await verifyPasscode(passcode.trim());
      if (!ok) {
        setStatus('error');
        setErrorMessage('Incorrect passcode.');
        return;
      }
      onSignedIn();
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed');
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Guestlist</h1>
        <p className={styles.subtitle}>Enter the door passcode.</p>
        <input
          type="password"
          autoFocus
          inputMode="text"
          autoComplete="off"
          className={styles.input}
          value={passcode}
          onChange={(e) => setPasscodeInput(e.target.value)}
          placeholder="Passcode"
          aria-label="Passcode"
        />
        <button
          type="submit"
          className={styles.button}
          disabled={status === 'submitting' || !passcode.trim()}
        >
          {status === 'submitting' ? 'Signing in…' : 'Sign in'}
        </button>
        {errorMessage && <p className={styles.error}>{errorMessage}</p>}
      </form>
    </div>
  );
}
