import "../styles/landing.css";
import { AppHeader } from "../components/AppHeader";
import { Features } from "../components/landing/Features";
import { Hero } from "../components/landing/Hero";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Sample } from "../components/landing/Sample";
import { ScrollProgress } from "../components/landing/ScrollProgress";
import { WhyItMatters } from "../components/landing/WhyItMatters";
import { Workflow } from "../components/landing/Workflow";

/**
 * Public marketing page at "/". Recreates the team's live demo site for BrandVisibility:
 * measuring how often AI assistants recommend a brand for real customer questions.
 *
 * `on-band-dark`: in dark theme this pins every shared control (chips, cards, buttons, the score
 * glass) to the warm-grey band palette + amber, instead of the app's own dark surfaces — see
 * tokens.css's `.on-band*` scope classes. It's a no-op in light theme.
 */
export function LandingPage() {
  return (
    <div className="lp on-band-dark">
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
    </div>
  );
}
