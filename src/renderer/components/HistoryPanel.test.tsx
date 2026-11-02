import { describe, expect, it } from 'vitest';
import { dayLabel } from './HistoryPanel';

describe('dayLabel', () => {
  const now = new Date(2026, 9, 25, 15, 0).getTime();

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 9, 25, 0, 5).getTime(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 24, 23, 0).getTime(), now)).toBe(
      'Yesterday',
    );
  });

  it('names the weekday within the last week, then the date', () => {
    const weekday = new Date(2026, 9, 21, 12).getTime();
    expect(dayLabel(weekday, now)).toBe(
      new Date(weekday).toLocaleDateString(undefined, { weekday: 'long' }),
    );
    const older = new Date(2026, 8, 3, 12).getTime();
    expect(dayLabel(older, now)).not.toMatch(/2026/);
    expect(dayLabel(new Date(2025, 8, 3, 12).getTime(), now)).toMatch(/2025/);
  });
});
