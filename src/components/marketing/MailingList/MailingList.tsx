import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Button from '../../shared/Button/Button.tsx';
import {
  mailingListHeadline,
  mailingListCopy,
} from '../../../content/site.ts';
import { joinMailingList } from '../../../services/mailing-list.ts';
import styles from './MailingList.module.css';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

interface MailingListProps {
  onClose: () => void;
}

export default function MailingList({ onClose }: MailingListProps) {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [emailError, setEmailError] = useState('');

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [handleEscape]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = (formData.get('email') as string).trim();
    const name = (formData.get('name') as string).trim() || undefined;

    if (!email) {
      setEmailError('Email is required');
      return;
    }
    if (!email.includes('@')) {
      setEmailError('Please enter a valid email');
      return;
    }

    setEmailError('');
    setStatus('submitting');

    try {
      await joinMailingList(email, name);
      setStatus('success');
      form.reset();
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={mailingListHeadline}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>

        {status === 'success' ? (
          <div className={styles.successMessage}>
            <h2 className={styles.successHeading}>You're on the list!</h2>
            <p>We'll keep you posted on upcoming shows and announcements.</p>
            <button className={styles.dismissButton} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className={styles.heading}>{mailingListHeadline}</h2>
            <p className={styles.subtitle}>{mailingListCopy}</p>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.fieldGroup}>
                <label htmlFor="mailing-email" className={styles.label}>
                  Email <span className={styles.required}>*</span>
                </label>
                <input
                  id="mailing-email"
                  name="email"
                  type="email"
                  required
                  className={`${styles.input} ${emailError ? styles.inputError : ''}`}
                  placeholder="you@example.com"
                />
                {emailError && <p className={styles.fieldError}>{emailError}</p>}
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="mailing-name" className={styles.label}>
                  Name
                </label>
                <input
                  id="mailing-name"
                  name="name"
                  type="text"
                  className={styles.input}
                  placeholder="Your name (optional)"
                />
              </div>

              {status === 'error' && (
                <p className={styles.errorMessage} role="alert">
                  Something went wrong. Please try again.
                </p>
              )}

              <Button type="submit" variant="primary" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Joining…' : 'Join'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
