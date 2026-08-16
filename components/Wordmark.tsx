export function Wordmark({ as: Tag = 'h1' }: { as?: 'h1' | 'span' }) {
  return (
    <Tag className="font-display text-4xl leading-none font-extrabold tracking-tight sm:text-5xl">
      <span className="text-cream">Bombay</span>
      <span className="text-sodium">Nights</span>
    </Tag>
  );
}
