/** How a page's link can be copied, beyond its bare address. */
export type CopyFormat = 'markdown' | 'text';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/** `[Title](address)`, safe whatever brackets the title or address holds. */
export function markdownLink(title: string, url: string): string {
  const text = (oneLine(title) || hostOf(url)).replace(/[\\[\]]/g, '\\$&');
  const target = url
    .replace(/\s/g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
  return `[${text}](${target})`;
}

/** The title and the address on two lines; just the address without a title. */
export function plainTextLink(title: string, url: string): string {
  const text = oneLine(title);
  return text ? `${text}\n${url}` : url;
}

export function formatPageLink(
  format: CopyFormat,
  title: string,
  url: string,
): string {
  return format === 'markdown'
    ? markdownLink(title, url)
    : plainTextLink(title, url);
}
