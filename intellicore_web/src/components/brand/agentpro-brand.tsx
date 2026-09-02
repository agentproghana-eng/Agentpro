import Image from "next/image";
import Link from "next/link";

type Props = {
  compact?: boolean;
};

export function AgentProBrand({ compact = false }: Props) {
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
        <strong>AgentPro</strong>

        {!compact && <span>Marketplace · Business · Community</span>}
      </span>
    </Link>
  );
}
