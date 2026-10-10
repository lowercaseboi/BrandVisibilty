import "../styles/landing.css";
import { AppHeader } from "../components/AppHeader";
import { Features } from "../components/landing/Features";
import { Hero } from "../components/landing/Hero";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Sample } from "../components/landing/Sample";
import { ScrollFab } from "../components/landing/ScrollFab";
import { ScrollProgress } from "../components/landing/ScrollProgress";
import { WhyItMatters } from "../components/landing/WhyItMatters";
import { Workflow } from "../components/landing/Workflow";

/**
 * Public marketing page at "/". Measures how often AI assistants recommend a brand for real
 * customer questions.
 *
 * One continuous surface that follows the light/dark toggle: sections are separated by space and a
 * hairline, not alternating bands. landing.css flattens the shared chrome (frames, offset shadows,
 * crop marks, page grid) under `.lp` only, so the app pages keep their own look.
 */
export function LandingPage() {
  return (
    <div className="lp">
      <ScrollProgress />
      <AppHeader variant="landing" />
      <main>
        <Hero />
        <WhyItMatters />
        <Workflow />
        <Sample />
        <Features />
      </main>
      <LandingFooter />
      <ScrollFab />
    </div>
  );
}
