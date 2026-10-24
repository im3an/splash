import { stepZoom } from './zoom';

describe('stepZoom', () => {
  it('steps through presets', () => {
    expect(stepZoom(100, 'in')).toBe(110);
    expect(stepZoom(100, 'out')).toBe(90);
    expect(stepZoom(67, 'in')).toBe(75);
  });

  it('snaps from in-between values', () => {
    expect(stepZoom(104, 'in')).toBe(110);
    expect(stepZoom(104, 'out')).toBe(100);
  });

  it('stops at the limits', () => {
    expect(stepZoom(500, 'in')).toBe(500);
    expect(stepZoom(25, 'out')).toBe(25);
  });
});
