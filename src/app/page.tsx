import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Candid — a little more familiar",
  description:
    "An AI companion for adults settling into a new place. Talk things through, choose what to remember, and find your own next step.",
};

export default function Home() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <p className="brand">
          candid<span aria-hidden="true">.</span>
        </p>
        <nav className={styles.nav} aria-label="Main navigation">
          <a className={styles.navLink} href="#how-it-works">
            How it works
          </a>
          <a className={styles.navLink} href="#your-space">
            Your space
          </a>
          <Link className={styles.button} href="/app" prefetch={false}>
            Open app
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>A little room to find your feet</p>
            <h1 id="landing-title" className={styles.title}>
              a new place.<span className={styles.subline}>a little more familiar.</span>
            </h1>
            <p className={styles.intro}>
              An AI companion for settling in, talking things through, and finding your own next step.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.button} href="/app" prefetch={false}>
                Start a conversation
              </Link>
              <a className={styles.textLink} href="#how-it-works">
                Get to know Candid
              </a>
            </div>
            <p className={styles.caption}>Proof of concept · for adults 18+</p>
          </div>

          <figure className={styles.preview} aria-labelledby="example-caption">
            <figcaption id="example-caption" className={styles.previewHeading}>
              <span className={styles.eyebrow}>A small beginning</span>
              <span className={styles.caption}>Example conversation</span>
            </figcaption>
            <div className={styles.exampleMessages}>
              <div className={styles.userMessage}>
                <span className={styles.speaker}>You</span>
                <p>I just moved here. Everything still feels a little unfamiliar.</p>
              </div>
              <div className={styles.assistantMessage}>
                <span className={styles.speaker}>Candid · AI</span>
                <p>
                  A new place can be a lot to take in. What&apos;s one part of your day you&apos;d like to feel easier?
                </p>
              </div>
              <div className={styles.userMessage}>
                <span className={styles.speaker}>You</span>
                <p>Maybe finding a place to spend a quiet Saturday morning.</p>
              </div>
            </div>
            <p className={styles.previewNote}>No perfect opening line needed. Start with what&apos;s on your mind.</p>
          </figure>
        </section>

        <ul className={styles.principles} aria-label="What to expect">
          <li>Your memories, your choice.</li>
          <li>Your conversations, yours to delete.</li>
          <li>Human connections come first.</li>
        </ul>

        <section id="how-it-works" className={styles.section} aria-labelledby="how-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>At your own pace</p>
            <h2 id="how-title">how it works.</h2>
          </div>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                01
              </span>
              <h3>talk it through.</h3>
              <p>A new routine, a small win, a day that felt a bit off. There&apos;s room for the everyday things.</p>
            </li>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                02
              </span>
              <h3>choose what stays.</h3>
              <p>Review, edit, save, or dismiss suggested memories. You decide what becomes a saved memory.</p>
            </li>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                03
              </span>
              <h3>find your next step.</h3>
              <p>Think through a small step toward the people and places around you. What happens next is up to you.</p>
            </li>
          </ol>
        </section>

        <section id="your-space" className={`${styles.section} ${styles.yourSpace}`} aria-labelledby="control-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Your space, on your terms</p>
            <h2 id="control-title">
              you choose
              <br />
              <span className={styles.subline}>what stays.</span>
            </h2>
            <p className={styles.sectionIntro}>
              A conversation can help you sort things out. You should also know what happens to what you share.
            </p>
          </div>
          <dl className={styles.details}>
            <div>
              <dt>Memories need your say.</dt>
              <dd>
                Candid suggests things to remember. Review and edit the suggestion before saving it, or dismiss it.
              </dd>
            </div>
            <div>
              <dt>Your chat history is saved.</dt>
              <dd>
                Conversations are saved so you can revisit them in this browser. Delete one conversation or all your app
                data from the app. Saved memories have their own delete controls.
              </dd>
            </div>
            <div>
              <dt>Begin with an anonymous session.</dt>
              <dd>
                No email or password to get started. Keep using the same browser to return; signing out, clearing
                cookies, or switching devices means you can&apos;t return to that anonymous session.
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <p className={styles.eyebrow}>One conversation is a place to start</p>
          <h2 id="closing-title">start where you are.</h2>
          <p>You don&apos;t have to have it all figured out.</p>
          <Link className={styles.button} href="/app" prefetch={false}>
            Open app
          </Link>
          <p className={styles.closingNote}>
            Candid is AI, not a person or a clinical service. Replies can be wrong. It won&apos;t contact anyone for you
            and doesn&apos;t replace human relationships or professional support.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <p className="brand">
          candid<span aria-hidden="true">.</span>
        </p>
        <p className={styles.caption}>Made for Hackathon@Dartmouth · 2026</p>
        <a className={styles.textLink} href="#main-content">
          Back to top
        </a>
      </footer>
    </div>
  );
}
