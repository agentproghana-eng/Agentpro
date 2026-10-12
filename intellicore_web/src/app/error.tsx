"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="ic-notfound">
      <div className="ic-notfound-card">
        <p className="ic-notfound-code">Oops</p>
        <h1>Something went wrong.</h1>
        <p>Please try again. If it keeps happening, email support@agentproghana.com.</p>

        <div className="ic-notfound-actions">
          <button type="button" className="ic-hub-button-light" onClick={reset}>
            Try again
          </button>

          <Link href="/" className="ic-hub-button-dark">
            Back to Marketplace
          </Link>
        </div>
      </div>
    </main>
  );
}
