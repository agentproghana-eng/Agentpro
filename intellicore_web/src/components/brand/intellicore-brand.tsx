import Link from "next/link";

type Props = {
  compact?: boolean;
};

export function IntellicoreBrand({ compact = false }: Props) {
  return (
    <Link className="ic-brand" href="/" aria-label="Intellicore Systems home">
      <span className="ic-brand-mark" aria-hidden="true">
        I
      </span>

      <span className="ic-brand-copy">
        <strong>Intellicore</strong>

        {!compact && <span>Technology for the way business works</span>}
      </span>
    </Link>
  );
}
