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

export default function BookingForm() {
  const [status, setStatus] = useState<FormStatus>('idle');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await submitBookingInquiry({
        name: formData.get('name') as string,
        email: formData.get('email') as string,
        phone: (formData.get('phone') as string) || undefined,
        date: formData.get('date') as string,
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
        <Heading subtitle={bookingIntroCopy}>Book a Show</Heading>

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
              className={styles.input}
              placeholder="Your name"
            />
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
              className={styles.input}
              placeholder="you@example.com"
            />
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
                className={styles.input}
              />
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
              className={styles.input}
              placeholder="Venue name or address"
            />
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

