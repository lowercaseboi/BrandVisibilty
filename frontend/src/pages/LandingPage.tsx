import "../styles/landing.css";
import { Features } from "../components/landing/Features";
import { Hero } from "../components/landing/Hero";
import { LandingFooter } from "../components/landing/LandingFooter";
import { LandingNav } from "../components/landing/LandingNav";
import { Sample } from "../components/landing/Sample";
import { WhyItMatters } from "../components/landing/WhyItMatters";
import { Workflow } from "../components/landing/Workflow";

/**
 * Public marketing page at "/". Recreates the team's live demo site for BrandVisibility:
 * measuring how often AI assistants recommend a brand for real customer questions.
 */
export function LandingPage() {
  return (
    <div className="lp">
      <LandingNav />
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
