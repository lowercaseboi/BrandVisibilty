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
 * One continuous surface that follows the light/dark toggle: each module fills one window,
 * separated by a visible hairline rather than alternating bands. The look itself (flat chrome, teal /
 * amber accent, dot grid, 1.2x scale) is global — tokens.css, base.css, scale.css — and shared with
 * the app; landing.css only holds the page's own layout.
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
