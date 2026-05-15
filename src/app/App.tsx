import { useState } from 'react';
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
import Guestlist from '../components/guestlist/Guestlist.tsx';

function isGuestlistRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/$/, '') === '/guestlist';
}

function MarketingSite() {
  const [showMailingList, setShowMailingList] = useState(false);
  const openMailingList = () => setShowMailingList(true);

  return (
    <div className="app">
      <a href="#main-content" className="skipLink">
        Skip to content
      </a>
      <Header onOpenMailingList={openMailingList} />
      <main id="main-content">
        <Hero onOpenMailingList={openMailingList} />
        <About />
        <Performers />
        <Media />
        <Calendar />
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
  return isGuestlistRoute() ? <Guestlist /> : <MarketingSite />;
}

export default App;
