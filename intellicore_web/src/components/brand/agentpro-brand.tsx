import Image from "next/image";
import Link from "next/link";

type Props = {
  compact?: boolean;
  ecosystem?: boolean;
};

export function AgentProBrand({
  compact = false,
  ecosystem = false,
}: Props) {
  if (ecosystem) {
    return (
      <Link
        className="ic-brand ic-brand-ecosystem"
        href="/"
        aria-label="CoreIntel | AgentPro — One App Every Business"
      >
        <span className="ic-ecosystem-company">CoreIntel</span>

        <span className="ic-ecosystem-divider" aria-hidden="true" />

        <span className="ic-ecosystem-product">
          <strong>
            <span>Agent</span>
            <em>Pro</em>
          </strong>

          <small>One App Every Business</small>
        </span>
      </Link>
    );
  }

  return (
    <Link className="ic-brand" href="/" aria-label="AgentPro Ghana home">
      <span className="ic-brand-mark" aria-hidden="true">
        <Image
          src="/agentpro-shield.png"
          alt=""
          width={34}
          height={34}
          style={{ width: "32px", height: "32px", objectFit: "contain" }}
        />
      </span>

      <span className="ic-brand-copy">
        <strong><span style={{ color: "var(--ic-teal-800)" }}>Agent</span><em style={{ color: "var(--ic-gold-600)", fontStyle: "normal" }}>Pro</em></strong>

        {!compact && <span>One App Every Business</span>}
      </span>
    </Link>
  );
}
