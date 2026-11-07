import { describe, expect, it, vi } from 'vitest';
import { HungRenderer } from './hung-renderer';

function setup() {
  const contents = { forcefullyCrashRenderer: vi.fn() };
  return { contents, go: vi.fn(), hung: new HungRenderer(contents) };
}

describe('leaving a page', () => {
  it('just goes when the page is working, without touching its process', () => {
    const { contents, go, hung } = setup();
    hung.leave(go);
    expect(go).toHaveBeenCalledOnce();
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('just goes when the page has answered again', () => {
    const { contents, go, hung } = setup();
    hung.stoppedAnswering();
    hung.answeredAgain();
    hung.leave(go);
    expect(go).toHaveBeenCalledOnce();
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });
});

describe('leaving a page that has stopped answering', () => {
  it('ends the process, and only goes once it has gone', () => {
    const { contents, go, hung } = setup();
    hung.stoppedAnswering();
    hung.leave(go);
    expect(contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();
    expect(go).not.toHaveBeenCalled();

    expect(hung.processGone()).toBe('ended');
    expect(go).toHaveBeenCalledOnce();
  });

  it('goes only to the latest place asked for while the process is ending', () => {
    const { contents, go, hung } = setup();
    const first = vi.fn();
    hung.stoppedAnswering();
    hung.leave(first);
    hung.leave(go);
    expect(contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();

    hung.processGone();
    expect(first).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledOnce();
  });

  it('goes straight away the next time', () => {
    const { contents, go, hung } = setup();
    hung.stoppedAnswering();
    hung.leave(vi.fn());
    hung.processGone();

    hung.leave(go);
    expect(go).toHaveBeenCalledOnce();
    expect(contents.forcefullyCrashRenderer).toHaveBeenCalledOnce();
  });
});

describe('telling our ending from a crash', () => {
  it('calls a process that went by itself a crash', () => {
    expect(setup().hung.processGone()).toBe('crashed');
  });

  it('reports only the one ending as ours', () => {
    const { hung } = setup();
    hung.stoppedAnswering();
    hung.leave(vi.fn());
    expect(hung.processGone()).toBe('ended');
    expect(hung.processGone()).toBe('crashed');
  });

  it('counts a crash during a hang as the end of the hang', () => {
    const { contents, go, hung } = setup();
    hung.stoppedAnswering();
    expect(hung.processGone()).toBe('crashed');

    hung.leave(go);
    expect(go).toHaveBeenCalledOnce();
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });
});
