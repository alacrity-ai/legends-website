import { useEffect, useState } from 'react';
import './App.css';
import Header from '../components/layout/Header/Header.tsx';
import Footer from '../components/layout/Footer/Footer.tsx';
import Hero from '../components/marketing/Hero/Hero.tsx';
import About from '../components/marketing/About/About.tsx';
import Performers from '../components/marketing/Performers/Performers.tsx';
import Media from '../components/marketing/Media/Media.tsx';
import Calendar from '../components/marketing/Calendar/Calendar.tsx';
import BookingForm from '../components/marketing/BookingForm/BookingForm.tsx';
import MailingList from '../components/marketing/MailingList/MailingList.tsx';
import PressKit from '../components/marketing/PressKit/PressKit.tsx';
import Admin from '../components/admin/Admin.tsx';

function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '');
  // /guestlist is kept as a back-compat alias for the door check-in tool.
  return path === '/admin' || path.startsWith('/admin/') || path === '/guestlist';
}

function MarketingSite() {
  const [showMailingList, setShowMailingList] = useState(false);
  const openMailingList = () => setShowMailingList(true);

  // When the page is loaded with a hash (e.g. arriving from /sinatra at
  // djkmdlegends.com/#book), the browser tries to scroll before React has
  // rendered the target. Re-scroll after mount, with a couple of retries to
  // account for the async-loading Calendar above the booking form shifting
  // layout height.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    let cancelled = false;
    const scroll = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
    const timers = [
      requestAnimationFrame(scroll),
      window.setTimeout(scroll, 400),
      window.setTimeout(scroll, 1000),
    ];
    return () => {
      cancelled = true;
      cancelAnimationFrame(timers[0]);
      window.clearTimeout(timers[1]);
      window.clearTimeout(timers[2]);
    };
  }, []);

  return (
    <div className="app">
      <a href="#main-content" className="skipLink">
        Skip to content
      </a>
      <Header onOpenMailingList={openMailingList} />
      <main id="main-content">
        <Hero onOpenMailingList={openMailingList} />
        <About />
        <Media />
        <Calendar />
        <Performers />
        <BookingForm />
        <PressKit />
      </main>
      <Footer />

      {showMailingList && (
        <MailingList onClose={() => setShowMailingList(false)} />
      )}
    </div>
  );
}

function App() {
  return isAdminRoute() ? <Admin /> : <MarketingSite />;
}

export default App;
