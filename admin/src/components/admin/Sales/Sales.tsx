import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSalesReport,
  getShowBuyers,
  type SalesBuyer,
  type SalesReport,
  type ShowSales,
} from '../../../services/sales.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import styles from './Sales.module.css';

interface SalesProps {
  onUnauthorized: () => void;
}

/** Categorical slots: the first three ticket types get a colour; the rest fold into "Other". */
const SERIES_SLOTS = 3;
const OTHER_LABEL = 'Other';
const TZ = 'America/New_York';

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('en-US');

function money(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}

function showDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}

function showDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: TZ,
  });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  return `${date} · ${time}`;
}

function purchasedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
}

function slotFor(ticketType: string, ticketTypes: string[]): number {
  const i = ticketTypes.indexOf(ticketType);
  return i >= 0 && i < SERIES_SLOTS ? i : SERIES_SLOTS;
}

function slotLabel(slot: number, ticketTypes: string[]): string {
  return slot < SERIES_SLOTS ? ticketTypes[slot] : OTHER_LABEL;
}

type BuyersState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; buyers: SalesBuyer[] };

export default function Sales({ onUnauthorized }: SalesProps) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<{ showId: string; ticketType: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [buyers, setBuyers] = useState<Record<string, BuyersState>>({});

  const load = useCallback(async () => {
    try {
      const data = await getSalesReport();
      setReport(data);
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setRefreshing(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const loadBuyers = useCallback(
    async (showId: string) => {
      setBuyers((prev) => ({ ...prev, [showId]: { status: 'loading' } }));
      try {
        const list = await getShowBuyers(showId);
        setBuyers((prev) => ({ ...prev, [showId]: { status: 'ready', buyers: list } }));
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setBuyers((prev) => ({
          ...prev,
          [showId]: { status: 'error', message: err instanceof Error ? err.message : 'Failed to load buyers' },
        }));
      }
    },
    [onUnauthorized],
  );

  const toggleShow = useCallback(
    (showId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(showId)) next.delete(showId);
        else next.add(showId);
        return next;
      });
      if (!buyers[showId]) void loadBuyers(showId);
    },
    [buyers, loadBuyers],
  );

  const maxGross = useMemo(
    () => (report ? report.shows.reduce((m, s) => Math.max(m, s.grossCents), 0) : 0),
    [report],
  );

  const legendSlots = useMemo(() => {
    if (!report || report.ticketTypes.length < 2) return [];
    const slots = report.ticketTypes.slice(0, SERIES_SLOTS).map((_, i) => i);
    if (report.ticketTypes.length > SERIES_SLOTS) slots.push(SERIES_SLOTS);
    return slots;
  }, [report]);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <span className={styles.overline}>Box office</span>
          <h1 className={styles.title}>Sales</h1>
          <p className={styles.subtitle}>
            Gross ticket sales from website checkout, by show. Refunds, Square fees and payouts
            live in Square.
          </p>
        </div>
        <button className={styles.refresh} onClick={handleRefresh} type="button" disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {!report && !error && <p className={styles.status}>Loading sales…</p>}

      {report && (
        <>
          <section className={styles.tiles} aria-label="Totals">
            <div className={`${styles.tile} ${styles.hero}`}>
              <span className={styles.tileLabel}>Gross ticket sales</span>
              <span className={styles.heroValue}>{money(report.totals.grossCents)}</span>
              <span className={styles.tileNote}>
                across {integer.format(report.totals.shows)} {report.totals.shows === 1 ? 'show' : 'shows'}
              </span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Tickets sold</span>
              <span className={styles.tileValue}>{integer.format(report.totals.tickets)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Orders</span>
              <span className={styles.tileValue}>{integer.format(report.totals.parties)}</span>
            </div>
          </section>

          <section className={styles.card} aria-label="Gross by show">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Gross by show</h2>
              {legendSlots.length > 0 && (
                <ul className={styles.legend} aria-label="Ticket types">
                  {legendSlots.map((slot) => (
                    <li key={slot} className={styles.legendItem}>
                      <span className={`${styles.swatch} ${styles[`s${slot}`]}`} aria-hidden="true" />
                      {slotLabel(slot, report.ticketTypes)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {report.shows.length === 0 && <p className={styles.status}>No shows yet.</p>}
            {report.shows.length > 0 && report.totals.grossCents === 0 && (
              <p className={styles.status}>No ticket sales yet.</p>
            )}

            {report.shows.length > 0 && (
              <ol className={styles.bars}>
                {report.shows.map((show) => {
                  const width = maxGross > 0 ? (show.grossCents / maxGross) * 100 : 0;
                  const segments = show.byType.filter((t) => t.grossCents > 0);
                  const caption =
                    active && active.showId === show.id
                      ? segments.find((t) => t.ticketType === active.ticketType) ?? null
                      : null;
                  return (
                    <li key={show.id} className={`${styles.barRow} ${show.isPast ? styles.barPast : ''}`}>
                      <div className={styles.barLabel}>
                        <span className={styles.barName}>{show.showName}</span>
                        <span className={styles.barDate}>{showDate(show.startTime)}</span>
                      </div>
                      <div className={styles.barLine}>
                        <div className={styles.barTrack}>
                          <div className={styles.bar} style={{ width: `${width}%` }} role="img" aria-label={`${show.showName}: ${money(show.grossCents)}`}>
                            {segments.map((t) => (
                              <span
                                key={t.ticketType}
                                className={`${styles.seg} ${styles[`s${slotFor(t.ticketType, report.ticketTypes)}`]}`}
                                style={{ flexGrow: t.grossCents }}
                                title={`${t.ticketType} · ${integer.format(t.tickets)} tickets · ${money(t.grossCents)}`}
                                onMouseEnter={() => setActive({ showId: show.id, ticketType: t.ticketType })}
                                onMouseLeave={() => setActive(null)}
                                onClick={() =>
                                  setActive((prev) =>
                                    prev && prev.showId === show.id && prev.ticketType === t.ticketType
                                      ? null
                                      : { showId: show.id, ticketType: t.ticketType },
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>
                        <span className={styles.barValue}>{money(show.grossCents)}</span>
                      </div>
                      {caption && (
                        <p className={styles.caption}>
                          <span className={`${styles.swatch} ${styles[`s${slotFor(caption.ticketType, report.ticketTypes)}`]}`} aria-hidden="true" />
                          {caption.ticketType} · {integer.format(caption.tickets)}{' '}
                          {caption.tickets === 1 ? 'ticket' : 'tickets'} · {money(caption.grossCents)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className={styles.card} aria-label="By show">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>By show</h2>
              <span className={styles.cardHint}>Tap a show to see its buyers</span>
            </div>
            {report.shows.length === 0 && <p className={styles.status}>No shows yet.</p>}
            <ul className={styles.showList}>
              {report.shows.map((show) => (
                <ShowCard
                  key={show.id}
                  show={show}
                  ticketTypes={report.ticketTypes}
                  expanded={expanded.has(show.id)}
                  buyers={buyers[show.id]}
                  onToggle={() => toggleShow(show.id)}
                />
              ))}
            </ul>
          </section>

          <p className={styles.footnote}>
            Gross is the amount paid at checkout. Orders recorded before amounts were captured are
            valued at the show&rsquo;s current ticket price; tickets with no price on file are
            counted but not valued. Updated {new Date(report.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Show card ─────────────────────────────────────────────── */

interface ShowCardProps {
  show: ShowSales;
  ticketTypes: string[];
  expanded: boolean;
  buyers: BuyersState | undefined;
  onToggle: () => void;
}

function ShowCard({ show, ticketTypes, expanded, buyers, onToggle }: ShowCardProps) {
  const status = show.isPast ? 'past' : show.soldOut ? 'soldOut' : 'onSale';
  const statusLabel = status === 'past' ? 'Past' : status === 'soldOut' ? 'Sold out' : 'On sale';
  const panelId = `buyers-${show.id}`;

  return (
    <li className={`${styles.show} ${show.isPast ? styles.showPast : ''}`}>
      <button
        className={styles.showHead}
        onClick={onToggle}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <span className={styles.showText}>
          <span className={styles.showName}>{show.showName}</span>
          <span className={styles.showWhen}>{showDateTime(show.startTime)}</span>
          <span className={styles.showWhere}>{show.venueName}</span>
        </span>
        <span className={styles.showRight}>
          <span className={`${styles.chip} ${styles[`chip_${status}`]}`}>{statusLabel}</span>
          <span className={styles.showGross}>{money(show.grossCents)}</span>
          <span className={styles.chevron} aria-hidden="true">
            {expanded ? '▴' : '▾'}
          </span>
        </span>
      </button>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Tickets</dt>
          <dd>{integer.format(show.tickets)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Orders</dt>
          <dd>{integer.format(show.parties)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Capacity</dt>
          <dd>
            {show.capacity === null
              ? 'Open'
              : `${integer.format(show.tickets)} / ${integer.format(show.capacity)}`}
          </dd>
        </div>
      </dl>

      {show.byType.length > 0 && (
        <ul className={styles.types} aria-label="Tickets by type">
          {show.byType.map((t) => (
            <li key={t.ticketType} className={styles.type}>
              <span className={`${styles.swatch} ${styles[`s${slotFor(t.ticketType, ticketTypes)}`]}`} aria-hidden="true" />
              <span className={styles.typeName}>{t.ticketType}</span>
              <span className={styles.typeMeta}>
                ×{integer.format(t.tickets)} · {money(t.grossCents)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.location}>
        <span className={styles.locLabel}>Money goes to</span>
        <span className={styles.locName}>{show.location.name}</span>
        <span className={styles.locNote}>
          {show.location.pending
            ? 'Square location · created at the first sale'
            : show.location.isDefault
              ? 'Square account default location'
              : 'Square location'}
        </span>
      </div>

      {show.unpricedTickets > 0 && (
        <p className={styles.warn}>
          {integer.format(show.unpricedTickets)} ticket{show.unpricedTickets === 1 ? '' : 's'} had no
          price on file and {show.unpricedTickets === 1 ? 'is' : 'are'} not included in gross.
        </p>
      )}

      <div id={panelId} className={styles.buyers} hidden={!expanded}>
        {(!buyers || buyers.status === 'loading') && <p className={styles.status}>Loading buyers…</p>}
        {buyers?.status === 'error' && <p className={styles.error}>{buyers.message}</p>}
        {buyers?.status === 'ready' && buyers.buyers.length === 0 && (
          <p className={styles.status}>No orders yet for this show.</p>
        )}
        {buyers?.status === 'ready' && buyers.buyers.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Buyer</th>
                  <th scope="col" className={styles.num}>Tickets</th>
                  <th scope="col">Type</th>
                  <th scope="col" className={styles.num}>Paid</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {buyers.buyers.map((b) => (
                  <tr key={b.paymentId}>
                    <td>
                      <span className={styles.buyerName}>
                        {`${b.firstName} ${b.lastName}`.trim() || '—'}
                      </span>
                      {b.email && <span className={styles.buyerEmail}>{b.email}</span>}
                    </td>
                    <td className={styles.num}>{integer.format(b.quantity)}</td>
                    <td>{b.ticketType || '—'}</td>
                    <td className={styles.num} title={b.recorded ? 'Checkout total' : 'Estimated from ticket price'}>
                      {b.amountCents === null ? '—' : money(b.amountCents)}
                      {b.amountCents !== null && !b.recorded && <span className={styles.est}>est.</span>}
                    </td>
                    <td className={styles.date}>{purchasedDate(b.purchasedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </li>
  );
}
