import {
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import type { z } from 'zod';
import type { InvokeOutputs } from '../../shared/api';
import {
  invokeContract,
  sendContract,
  type InvokeChannel,
  type SendChannel,
} from '../../shared/ipc';

export type InvokeHandlers = {
  [C in InvokeChannel]: (
    input: z.output<(typeof invokeContract)[C]>,
  ) => InvokeOutputs[C] | Promise<InvokeOutputs[C]>;
};

export type SendHandlers = {
  [C in SendChannel]: (input: z.output<(typeof sendContract)[C]>) => void;
};

/** The handlers for one shell window. */
export interface IpcTarget {
  /** Whether a frame URL belongs to the shipped shell UI. */
  isShellUrl(url: string): boolean;
  /** A window may handle only some channels; others are refused. */
  invoke: Partial<InvokeHandlers>;
  send: Partial<SendHandlers>;
}

/** Finds the shell window a message came from; `null` for any other sender. */
export type IpcTargetResolver = (sender: WebContents) => IpcTarget | null;

function trustedTarget(
  event: IpcMainEvent | IpcMainInvokeEvent,
  resolve: IpcTargetResolver,
): IpcTarget | null {
  const target = resolve(event.sender);
  const frame = event.senderFrame;
  const trusted =
    target !== null &&
    frame !== null &&
    frame.parent === null &&
    target.isShellUrl(frame.url);
  return trusted ? target : null;
}

let shellResolver: IpcTargetResolver | null = null;

/**
 * Whether a message came from the top frame of Splash's own UI, by the same
 * test the typed channels use. For channels a library registers itself.
 */
export function isFromShell(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return shellResolver !== null && trustedTarget(event, shellResolver) !== null;
}

/**
 * Wires the typed contract to its handlers. Every message is checked for
 * origin and parsed against its schema before any handler runs.
 * Returns a function that removes the handlers again.
 */
export function registerIpc(resolve: IpcTargetResolver): () => void {
  shellResolver = resolve;
  const invokeChannels = Object.keys(invokeContract) as InvokeChannel[];
  const sendChannels = Object.keys(sendContract) as SendChannel[];

  for (const channel of invokeChannels) {
    ipcMain.handle(channel, (event, raw: unknown) => {
      const target = trustedTarget(event, resolve);
      if (!target) throw new Error(`Rejected ${channel} from untrusted sender`);
      const handler = target.invoke[channel] as
        | ((value: unknown) => unknown)
        | undefined;
      if (!handler) throw new Error(`${channel} is not available here`);
      return handler(invokeContract[channel].parse(raw));
    });
  }

  const listeners = sendChannels.map((channel) => {
    const listener = (event: IpcMainEvent, raw: unknown) => {
      const target = trustedTarget(event, resolve);
      if (!target) return;
      const result = sendContract[channel].safeParse(raw);
      if (!result.success) return;
      const handler = target.send[channel] as
        | ((value: unknown) => void)
        | undefined;
      handler?.(result.data);
    };
    ipcMain.on(channel, listener);
    return [channel, listener] as const;
  });

  return () => {
    if (shellResolver === resolve) shellResolver = null;
    for (const channel of invokeChannels) ipcMain.removeHandler(channel);
    for (const [channel, listener] of listeners) {
      ipcMain.removeListener(channel, listener);
    }
  };
}
