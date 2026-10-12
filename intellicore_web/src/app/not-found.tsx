import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="ic-notfound">
      <div className="ic-notfound-card">
        <p className="ic-notfound-code">404</p>
        <h1>We could not find that page.</h1>
        <p>
          The link may be old or mistyped. Try the Marketplace, or get the
          AgentPro app.
        </p>

        <div className="ic-notfound-actions">
          <Link href="/" className="ic-hub-button-light">
            Back to Marketplace
          </Link>

          <a href="/download/agentpro-latest.apk" className="ic-hub-button-dark">
            Get the app
          </a>
        </div>
      </div>
    </main>
  );
}
