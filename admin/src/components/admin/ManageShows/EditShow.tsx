import { useState, type FormEvent } from 'react';
import {
  updateEvent,
  type EventPatchInput,
  type ManagedEvent,
} from '../../../services/admin-events.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import { easternIsoToLocalInput, toEasternIso } from '../../../utils/eastern-time.ts';
import styles from '../EventForm/EventForm.module.css';

interface TicketRow {
  ticketType: string;
  price: string;
}

interface EditShowProps {
  event: ManagedEvent;
  onCancel: () => void;
  onSaved: (updated: ManagedEvent) => void;
  onUnauthorized: () => void;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

export default function EditShow({ event, onCancel, onSaved, onUnauthorized }: EditShowProps) {
  const [showName, setShowName] = useState(event.showName);
  const [description, setDescription] = useState(event.description);
  const [venueName, setVenueName] = useState(event.venueName);
  const [venueAddress, setVenueAddress] = useState(event.venueAddress);
  const [startLocal, setStartLocal] = useState(easternIsoToLocalInput(event.startTime));
  const [endLocal, setEndLocal] = useState(easternIsoToLocalInput(event.endTime));
  const [tickets, setTickets] = useState<TicketRow[]>(
    event.tickets.map((t) => ({ ticketType: t.ticketType, price: String(t.priceCents / 100) })),
  );
  const [capacity, setCapacity] = useState(event.capacity != null ? String(event.capacity) : '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateTicket = (i: number, patch: Partial<TicketRow>) =>
    setTickets((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addTicket = () => setTickets((rows) => [...rows, { ticketType: '', price: '' }]);
  const removeTicket = (i: number) => setTickets((rows) => rows.filter((_, idx) => idx !== i));

  const onImageChange = (file: File | null) => {
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const validate = (): string | null => {
    if (!showName.trim()) return 'Show name is required.';
    if (!description.trim()) return 'Description is required.';
    if (!venueName.trim()) return 'Venue name is required.';
    if (!venueAddress.trim()) return 'Venue address is required.';
    if (!startLocal) return 'Start time is required.';
    if (!endLocal) return 'End time is required.';
    if (new Date(toEasternIso(endLocal)).getTime() <= new Date(toEasternIso(startLocal)).getTime())
      return 'End time must be after the start time.';

    const seen = new Set<string>();
    for (const t of tickets) {
      if (!t.ticketType.trim()) return 'Every ticket type needs a name.';
      const key = t.ticketType.trim().toLowerCase();
      if (seen.has(key)) return `Duplicate ticket type: ${t.ticketType.trim()}.`;
      seen.add(key);
      const price = Number(t.price);
      if (!Number.isFinite(price) || price <= 0)
        return `Enter a valid price for "${t.ticketType.trim()}".`;
    }

    if (capacity.trim()) {
      const cap = Number(capacity);
      if (!Number.isInteger(cap) || cap < 1)
        return 'Capacity must be a positive whole number (or leave it blank for unlimited).';
    }

    if (imageFile) {
      if (!ACCEPTED_IMAGE_TYPES.includes(imageFile.type))
        return 'Image must be a JPEG, PNG, or WebP file.';
      if (imageFile.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller.';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const patch: EventPatchInput = {
        showName: showName.trim(),
        description: description.trim(),
        venueName: venueName.trim(),
        venueAddress: venueAddress.trim(),
        startTime: toEasternIso(startLocal),
        endTime: toEasternIso(endLocal),
        tickets: tickets.map((t) => ({ ticketType: t.ticketType.trim(), price: Number(t.price) })),
        capacity: capacity.trim() ? Number(capacity) : null,
      };
      if (imageFile) patch.image = await readAsDataUrl(imageFile);

      const updated = await updateEvent(event.id, patch);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      onSaved(updated);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to update the show.');
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <h1 className={styles.title}>Edit “{event.showName}”</h1>

      <label className={styles.field}>
        <span className={styles.label}>Show name</span>
        <input
          className={styles.input}
          value={showName}
          onChange={(e) => setShowName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea
          className={styles.textarea}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Venue name</span>
          <input
            className={styles.input}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Venue address</span>
          <input
            className={styles.input}
            value={venueAddress}
            onChange={(e) => setVenueAddress(e.target.value)}
            disabled={submitting}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Start time</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>End time</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            disabled={submitting}
          />
        </label>
      </div>

      <fieldset className={styles.ticketsFieldset} disabled={submitting}>
        <legend className={styles.label}>Ticket types &amp; prices</legend>
        {tickets.map((t, i) => (
          <div key={i} className={styles.ticketRow}>
            <input
              className={styles.input}
              value={t.ticketType}
              onChange={(e) => updateTicket(i, { ticketType: e.target.value })}
              placeholder="e.g. Dinner + Show"
              aria-label={`Ticket type ${i + 1}`}
            />
            <div className={styles.priceWrap}>
              <span className={styles.pricePrefix}>$</span>
              <input
                className={styles.priceInput}
                type="number"
                min="0"
                step="0.01"
                value={t.price}
                onChange={(e) => updateTicket(i, { price: e.target.value })}
                placeholder="45.00"
                aria-label={`Price for ticket type ${i + 1}`}
              />
            </div>
            {tickets.length > 1 && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeTicket(i)}
                aria-label={`Remove ticket type ${i + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className={styles.addButton} onClick={addTicket}>
          + Add ticket type
        </button>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Capacity (optional)</span>
        <input
          className={styles.input}
          type="number"
          min="1"
          step="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Leave blank for unlimited"
          disabled={submitting}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Replace image (optional)</span>
        <input
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onImageChange(e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
        {imagePreview && (
          <img className={styles.preview} src={imagePreview} alt="New show preview" />
        )}
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.row}>
        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className={styles.submit}
          onClick={onCancel}
          disabled={submitting}
          style={{ background: 'transparent' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
