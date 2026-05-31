import type { FeaturedAct } from '../types/featured-act.ts';

/**
 * Featured acts that have their own dedicated landing page (separate from the
 * main performer carousel). Add an entry here to surface a new featured act in
 * the "Featured Acts" block below the carousel.
 */
export const featuredActs: FeaturedAct[] = [
  {
    id: 'sinatra',
    name: 'Sinatra Under the Stars',
    blurb:
      'Joey Chiarenza brings Frank Sinatra and the Rat Pack to life — joined by Dino & Sammy Davis Jr. and a full orchestra. An AGT alum with hundreds of shows across New England.',
    href: '/sinatra/',
    imageSrc: '/sinatra/joey-chiarenza.jpg',
    imageAlt:
      'Joey Chiarenza performing as Frank Sinatra alongside Dean Martin and Sammy Davis Jr. tributes with a live orchestra',
  },
];
