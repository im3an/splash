import mark from '../../../assets/brand/mark.svg?raw';

/** The vector master uses currentColor in the shell, adapting to each theme. */
export function BrandMark({
  size = 24,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{
        __html: mark.replaceAll('#221d17', 'currentColor'),
      }}
    />
  );
}

export function Brand({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg">
      <BrandMark size={size} />
      <span className="text-title font-semibold tracking-[-0.025em]">
        Splash
      </span>
    </span>
  );
}
