export interface BookingFormData {
  name: string;
  email: string;
  phone?: string;
  date: string;
  eventType?: string;
  location: string;
  message?: string;
}

const bookingApiUrl = import.meta.env.VITE_BOOKING_API_URL;

export async function submitBookingInquiry(data: BookingFormData): Promise<void> {
  const res = await fetch(`${bookingApiUrl}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Booking submission failed');
  }
}
