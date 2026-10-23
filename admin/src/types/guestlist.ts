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

/** Party id → when its first guest checked in. */
export type CheckinMap = Record<string, string>;

/** Party id → how many of the party have arrived (checked-in parties only). */
export type ArrivedMap = Record<string, number>;
