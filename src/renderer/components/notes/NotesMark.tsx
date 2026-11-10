import mark from '../../../../assets/brand/features/notes.svg?raw';

/** The notes mark: a page whose corner is Splash's drop. Takes the text colour. */
export function NotesMark({
  size = 16,
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
