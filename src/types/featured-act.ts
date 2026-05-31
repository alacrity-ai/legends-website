export interface FeaturedAct {
  id: string;
  name: string;
  blurb: string;
  /** Destination — a dedicated landing page (e.g. "/sinatra/"). */
  href: string;
  imageSrc: string;
  imageAlt: string;
}
