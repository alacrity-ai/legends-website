import type { Performer } from '../types/performer.ts';

export const performers: Performer[] = [
  {
    id: 'elvis-tribute',
    name: 'The King Experience',
    imageSrc: '/assets/images/performer-elvis.jpg',
    imageAlt: 'Elvis tribute performer on stage',
    shortDescription:
      'A high-energy Elvis Presley tribute featuring iconic hits, authentic costumes, and electrifying stage presence.',
    tags: ['tribute', 'live vocals', 'event-ready'],
  },
  {
    id: 'sinatra-tribute',
    name: 'Sinatra Under the Stars',
    imageSrc: '/assets/images/performer-sinatra.jpg',
    imageAlt: 'Frank Sinatra tribute performer in classic suit',
    shortDescription:
      'Timeless Frank Sinatra classics delivered with smooth vocals and old-school charm — perfect for upscale venues and cocktail events.',
    tags: ['tribute', 'live vocals', 'themed show'],
  },
  {
    id: 'motown-revue',
    name: 'Motown Gold Revue',
    imageSrc: '/assets/images/performer-motown.jpg',
    imageAlt: 'Motown revue performers on stage',
    shortDescription:
      'A dynamic group tribute to the Motown era featuring classics from The Temptations, The Supremes, Marvin Gaye, and more.',
    tags: ['tribute', 'live vocals', 'themed show', 'event-ready'],
  },
  {
    id: 'rat-pack',
    name: 'The Rat Pack Returns',
    imageSrc: '/assets/images/performer-ratpack.jpg',
    imageAlt: 'Rat Pack tribute performers in tuxedos',
    shortDescription:
      'Dean Martin, Sammy Davis Jr., and Frank Sinatra come alive in this swinging tribute show built for any crowd.',
    tags: ['tribute', 'live vocals', 'themed show'],
  },
];

