export type TicketVariation = 'Show and Meal' | 'Show Only' | 'Unknown';

export interface Purchase {
  variation: TicketVariation;
  quantity: number;
}

export interface Party {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  quantity: number;
  purchases: Purchase[];
  orderDate: string;
  notes: string | null;
  /** Reserved seating (v0.5): seat ids / labels once the webhook confirmed them. */
  seats?: string[];
  seatLabels?: string[];
  seatStatus?: 'assigned' | 'partial' | 'unassigned';
  /** When the Legends confirmation email last went to the buyer; absent = never (no email, or Mailgun failed). */
  confirmationSentAt?: string;
}

export type CheckinMap = Record<string, string>;
