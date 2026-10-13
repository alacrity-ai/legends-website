import type { FeaturedAct } from '../types/featured-act.ts';

/**
 * Featured acts that have their own dedicated landing page (separate from the
 * main performer carousel). Add an entry here to surface a new featured act in
 * the "Featured Acts" block below the carousel.
 */
export const featuredActs: FeaturedAct[] = [
  {
    id: 'sinatra',
    name: 'The Rat Pack',
    blurb:
      'Frank, Dean & Sammy with a live 17-piece orchestra: Joey Chiarenza as Sinatra, Joe Perce as Dean Martin and Lloyd Diamond as Sammy Davis Jr. See upcoming shows and get tickets.',
    href: '/sinatra/',
    imageSrc: '/sinatra/joey-chiarenza.jpg',
    imageAlt:
      'Frank Sinatra, Dean Martin and Sammy Davis Jr. tribute performers on stage with a live orchestra',
  },
  {
    id: 'ladies-legends',
    name: 'Ladies Legends',
    blurb:
      'Singers paying tribute to the greatest ladies ever — Cher, Madonna, Tina Turner, Stevie Nicks, Shania Twain, Pat Benatar, Amy Winehouse, Aretha Franklin, Alanis Morissette, and ABBA in one dazzling night.',
    href: '/ladies-legends/',
    imageSrc: '/ladies-legends/ladies-legends-card.webp',
    imageAlt:
      'Ladies Legends show poster — neon marquee lettering over a purple stage with a disco ball and spotlights',
  },
];
