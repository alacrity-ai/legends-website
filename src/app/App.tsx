import './App.css';
import Header from '../components/layout/Header/Header.tsx';
import Footer from '../components/layout/Footer/Footer.tsx';
import Hero from '../components/marketing/Hero/Hero.tsx';
import About from '../components/marketing/About/About.tsx';
import Performers from '../components/marketing/Performers/Performers.tsx';
import Media from '../components/marketing/Media/Media.tsx';
import Calendar from '../components/marketing/Calendar/Calendar.tsx';
import BookingForm from '../components/marketing/BookingForm/BookingForm.tsx';
import PressKit from '../components/marketing/PressKit/PressKit.tsx';

function App() {
  return (
    <div className="app">
      <a href="#main-content" className="skipLink">
        Skip to content
      </a>
      <Header />
      <main id="main-content">
        <Hero />
        <About />
        <Performers />
        <Media />
        <Calendar />
        <BookingForm />
        <PressKit />
      </main>
      <Footer />
    </div>
  );
}

export default App;

