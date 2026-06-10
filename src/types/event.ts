export interface EventTicket {
  ticketType: string;
  priceCents: number;
  /** Legacy v0.2 static link. New events mint checkout links on demand. */
  checkoutUrl?: string;
}

export interface CalendarEvent {
  /** Present on form-created (v0.2+) events; absent on legacy calendar events. */
  id?: string;
  title: string;
  date: string;
  time: string | null;
  endTime?: string | null;
  location: string | null;
  description: string | null;
  imageUrl?: string | null;
  soldOut?: boolean;
  tickets?: EventTicket[];
}
