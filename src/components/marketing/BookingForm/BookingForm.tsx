import { useState, type FormEvent } from 'react';
import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import Button from '../../shared/Button/Button.tsx';
import {
  bookingIntroCopy,
  eventTypes,
  sectionIds,
} from '../../../content/site.ts';
import { submitBookingInquiry } from '../../../services/booking.ts';
import styles from './BookingForm.module.css';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

type FieldErrors = Partial<Record<'name' | 'email' | 'date' | 'location', string>>;

function validate(formData: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!formData.get('name')?.toString().trim()) errors.name = 'Name is required';
  const email = formData.get('email')?.toString().trim() ?? '';
  if (!email) errors.email = 'Email is required';
  else if (!email.includes('@')) errors.email = 'Please enter a valid email';
  if (!formData.get('date')?.toString().trim()) errors.date = 'Event date is required';
  if (!formData.get('location')?.toString().trim()) errors.location = 'Location is required';
  return errors;
}

export default function BookingForm() {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const errors = validate(formData);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setStatus('submitting');

    try {
      await submitBookingInquiry({
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        phone: (formData.get('phone') as string) || undefined,
        date: formData.get('date') as string,
        time: (formData.get('time') as string) || undefined,
        eventType: (formData.get('eventType') as string) || undefined,
        location: formData.get('location') as string,
        message: (formData.get('message') as string) || undefined,
      });
      setStatus('success');
      form.reset();
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <Section id={sectionIds.book} className={styles.section}>
        <Container>
          <div className={styles.successMessage}>
            <h2 className={styles.successHeading}>Thank you!</h2>
            <p>Your booking inquiry has been sent. We'll be in touch soon.</p>
            <Button type="button" variant="primary" onClick={() => setStatus('idle')}>
              Send Another Inquiry
            </Button>
          </div>
        </Container>
      </Section>
    );
  }

  return (
    <Section id={sectionIds.book} className={styles.section}>
      <Container>
        <Heading align="center" subtitle={bookingIntroCopy}>
          Book a Show
        </Heading>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.fieldGroup}>
            <label htmlFor="booking-name" className={styles.label}>
              Name <span className={styles.required}>*</span>
            </label>
            <input
              id="booking-name"
              name="name"
              type="text"
              required
              className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
              placeholder="Your name"
            />
            {fieldErrors.name && <p className={styles.fieldError}>{fieldErrors.name}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="booking-email" className={styles.label}>
              Email <span className={styles.required}>*</span>
            </label>
            <input
              id="booking-email"
              name="email"
              type="email"
              required
              className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="booking-phone" className={styles.label}>
              Phone
            </label>
            <input
              id="booking-phone"
              name="phone"
              type="tel"
              className={styles.input}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label htmlFor="booking-date" className={styles.label}>
                Event Date <span className={styles.required}>*</span>
              </label>
              <input
                id="booking-date"
                name="date"
                type="date"
                required
                className={`${styles.input} ${fieldErrors.date ? styles.inputError : ''}`}
              />
              {fieldErrors.date && <p className={styles.fieldError}>{fieldErrors.date}</p>}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="booking-time" className={styles.label}>
                Event Time
              </label>
              <input
                id="booking-time"
                name="time"
                type="time"
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="booking-event-type" className={styles.label}>
              Event Type
            </label>
            <select
              id="booking-event-type"
              name="eventType"
              className={styles.input}
            >
              <option value="">Select type…</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="booking-location" className={styles.label}>
              Location / Venue <span className={styles.required}>*</span>
            </label>
            <input
              id="booking-location"
              name="location"
              type="text"
              required
              className={`${styles.input} ${fieldErrors.location ? styles.inputError : ''}`}
              placeholder="Venue name or address"
            />
            {fieldErrors.location && <p className={styles.fieldError}>{fieldErrors.location}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="booking-message" className={styles.label}>
              Message
            </label>
            <textarea
              id="booking-message"
              name="message"
              rows={4}
              className={styles.textarea}
              placeholder="Tell us about your event…"
            />
          </div>

          {status === 'error' && (
            <p className={styles.errorMessage} role="alert">
              Something went wrong. Please try again or email us directly.
            </p>
          )}

          <Button type="submit" variant="primary" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Sending…' : 'Send Inquiry'}
          </Button>
        </form>
      </Container>
    </Section>
  );
}

