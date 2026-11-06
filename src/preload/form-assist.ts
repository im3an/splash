import {
  addressValue,
  cardValue,
  classifyField,
  groupOf,
  matchOption,
  type FieldGroup,
  type FieldHints,
  type FieldKind,
} from '../shared/form-fields';
import type { FormFieldReport, FormFill } from '../shared/page-bridge';

/*
 * The page's side of Splash's password and address filling. It works out what
 * form fields are for, and fills them when the main process says the user
 * chose something from Splash's own menu. It holds no saved data: a page can't
 * reach this isolated world, and nothing is put in the page's DOM but the
 * values the user asked for.
 */

export interface FormAssistBridge {
  /** Resolves true if a menu opened for this field. */
  ask(report: FormFieldReport): Promise<boolean>;
  dismiss(): void;
  key(key: 'up' | 'down' | 'enter'): void;
  submitted(credentials: { username: string; password: string }): void;
  stillLogin(): void;
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** How long a sign-in has to make its form go away, before it's taken as failed. */
const SETTLE_MS = 1200;
/** A login form still showing this soon after arriving means it was refused. */
const STILL_LOGIN_MS = 500;

function isField(node: EventTarget | null): node is Field {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLTextAreaElement
  );
}

/**
 * Whether a person could see and use this field. Forms hidden from them can't
 * be filled, or a page could collect saved details without their knowing.
 */
export function isVisibleField(field: Field): boolean {
  if (field.disabled) return false;
  if (!(field instanceof HTMLSelectElement) && field.readOnly) return false;
  const rects = field.getClientRects();
  if (rects.length === 0) return false;
  const { width, height } = field.getBoundingClientRect();
  if (width < 2 || height < 2) return false;
  for (
    let element: Element | null = field;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) < 0.05) return false;
  }
  return true;
}

function labelText(field: Field): string {
  const labels = field.labels ? [...field.labels] : [];
  const labelledBy = field.getAttribute('aria-labelledby');
  const others = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => field.ownerDocument.getElementById(id))
        .filter((node) => node !== null)
    : [];
  return [...labels, ...others]
    .map((node) => node.textContent ?? '')
    .join(' ')
    .slice(0, 200);
}

function hintsOf(field: Field): FieldHints {
  return {
    type: field instanceof HTMLInputElement ? field.type : field.localName,
    autocomplete: field.getAttribute('autocomplete') ?? '',
    name: field.getAttribute('name') ?? '',
    id: field.id,
    placeholder: field.getAttribute('placeholder') ?? '',
    ariaLabel: field.getAttribute('aria-label') ?? '',
    label: labelText(field),
  };
}

/** The form a field belongs to, or its document for a form without a tag. */
function scopeOf(field: Field): ParentNode {
  return field.form ?? field.ownerDocument;
}

function fieldsIn(scope: ParentNode): Field[] {
  return [...scope.querySelectorAll('input, select, textarea')].filter(isField);
}

function hasPasswordField(scope: ParentNode): boolean {
  return fieldsIn(scope).some(
    (field) =>
      field instanceof HTMLInputElement &&
      field.type === 'password' &&
      isVisibleField(field),
  );
}

function kindOf(field: Field): FieldKind | null {
  return classifyField(hintsOf(field), hasPasswordField(scopeOf(field)));
}

/** Sets a value the way a person typing would look to the page's scripts. */
function setValue(field: Field, value: string): void {
  if (field instanceof HTMLSelectElement) {
    const option = matchOption(
      [...field.options].map(({ value: optionValue, text }) => ({
        value: optionValue,
        text,
      })),
      value,
    );
    if (option === null) return;
    field.value = option;
  } else {
    field.value = value;
  }
  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Where a field is in the top frame, across frames of the same origin. */
function rectInTop(field: Field): FormFieldReport['rect'] {
  const { x, y, width, height } = field.getBoundingClientRect();
  let left = x;
  let top = y;
  try {
    let view: Window | null = field.ownerDocument.defaultView;
    while (view && view !== view.top) {
      const frame = (view as Window & typeof globalThis).frameElement;
      if (!frame) return null;
      const offset = frame.getBoundingClientRect();
      left += offset.x;
      top += offset.y;
      view = view.parent;
    }
  } catch {
    return null;
  }
  return { x: left, y: top, width, height };
}

/** Fills what's visible in `scope`. Returns how many fields took a value. */
export function fillScope(
  scope: ParentNode,
  fill: FormFill,
  active: Field | null,
): number {
  let filled = 0;
  const put = (field: Field, value: string | null) => {
    if (value === null) return;
    setValue(field, value);
    filled += 1;
  };
  const group: FieldGroup = fill.group;
  const inLogin = hasPasswordField(scope);
  for (const field of fieldsIn(scope)) {
    if (!isVisibleField(field)) continue;
    const kind = classifyField(hintsOf(field), inLogin);
    if (!kind || groupOf(kind) !== group) continue;
    if (fill.group === 'login') {
      if (fill.newPassword !== null) {
        if (kind === 'new-password') put(field, fill.newPassword);
      } else if (kind === 'username') {
        put(field, fill.username);
      } else {
        put(field, fill.password);
      }
      continue;
    }
    // What someone already typed stays, unless it's the field they chose from.
    if (field.value !== '' && field !== active) continue;
    if (fill.group === 'address') {
      put(field, addressValue(kind, fill.address) || null);
    } else {
      const maxLength =
        field instanceof HTMLSelectElement ? -1 : field.maxLength;
      put(field, cardValue(kind, fill.card, maxLength) || null);
    }
  }
  return filled;
}

/** The login a submitted form holds, if it holds one. */
export function credentialsIn(
  scope: ParentNode,
  remembered: string,
): { username: string; password: string; field: HTMLInputElement } | null {
  const fields = fieldsIn(scope);
  const passwords = fields.filter(
    (field): field is HTMLInputElement =>
      field instanceof HTMLInputElement &&
      field.type === 'password' &&
      field.value !== '',
  );
  if (passwords.length === 0) return null;
  const fresh = passwords.filter(
    (field) => classifyField(hintsOf(field), true) === 'new-password',
  );
  // Changing a password: current, new and new again.
  const field =
    fresh[0] ??
    (passwords.length >= 2 &&
    passwords[passwords.length - 1]!.value ===
      passwords[passwords.length - 2]!.value
      ? passwords[passwords.length - 1]!
      : passwords[0]!);
  const named = fields.find((candidate) => {
    if (!(candidate instanceof HTMLInputElement) || candidate.value === '')
      return false;
    if (candidate.type === 'password' || candidate.type === 'hidden')
      return false;
    return classifyField(hintsOf(candidate), true) === 'username';
  });
  return {
    username: named?.value.trim() || remembered,
    password: field.value,
    field,
  };
}

/** Wires the listeners; `document` is the frame's own. */
export function installFormAssist(
  bridge: FormAssistBridge,
  doc: Document = document,
  /** Tests stand in here: a browser won't let a script fake `isTrusted`. */
  isReal: (event: Event) => boolean = (event) => event.isTrusted,
): { fill(fill: FormFill): void; closed(): void } {
  const view = doc.defaultView!;
  let active: Field | null = null;
  let menuOpen = false;
  /** The field the user already dismissed a menu on; clicks there stay quiet. */
  let answered: Field | null = null;
  /** A two-step sign-in asks for the name on an earlier screen. */
  let rememberedUsername = '';
  let pending: {
    username: string;
    password: string;
    field: HTMLInputElement;
    href: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  const closeMenu = () => {
    if (!menuOpen) return;
    menuOpen = false;
    bridge.dismiss();
  };

  const ask = (field: Field) => {
    const kind = kindOf(field);
    if (!kind) return;
    active = field;
    const scope = scopeOf(field);
    const usernameField = fieldsIn(scope).find(
      (candidate) =>
        candidate !== field &&
        kindOf(candidate) === 'username' &&
        candidate.value,
    );
    void bridge
      .ask({
        group: groupOf(kind),
        kind,
        rect: rectInTop(field),
        username: usernameField?.value.trim() || rememberedUsername,
      })
      .then((opened) => {
        menuOpen = opened;
      })
      .catch(() => undefined);
  };

  doc.addEventListener(
    'click',
    (event) => {
      if (!isReal(event) || !isField(event.target)) return;
      const field = event.target;
      if (field.value !== '' || field === answered || menuOpen) return;
      if (field instanceof HTMLSelectElement) return;
      answered = field;
      ask(field);
    },
    { capture: true },
  );

  doc.addEventListener(
    'keydown',
    (event) => {
      if (!isReal(event) || !isField(event.target)) return;
      if (menuOpen) {
        const key =
          event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowUp'
              ? 'up'
              : event.key === 'Enter'
                ? 'enter'
                : null;
        if (key) {
          event.preventDefault();
          event.stopImmediatePropagation();
          bridge.key(key);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenu();
        }
        return;
      }
      // The keyboard's way to ask again, as in other browsers.
      if (
        event.key === 'ArrowDown' &&
        event.target instanceof HTMLInputElement &&
        event.target.value === ''
      ) {
        event.preventDefault();
        ask(event.target);
        return;
      }
      if (
        event.key === 'Enter' &&
        event.target instanceof HTMLInputElement &&
        kindOf(event.target) !== null
      ) {
        considerSubmit(scopeOf(event.target));
      }
    },
    { capture: true },
  );

  doc.addEventListener(
    'input',
    (event) => {
      if (isReal(event)) closeMenu();
    },
    { capture: true },
  );
  doc.addEventListener(
    'focusout',
    (event) => {
      if (event.target === active) {
        closeMenu();
        answered = null;
      }
    },
    { capture: true },
  );
  doc.addEventListener('scroll', closeMenu, { capture: true, passive: true });

  /** Says whether the sign-in seems to have gone through, and reports it. */
  const report = () => {
    if (!pending) return;
    const { username, password, timer } = pending;
    clearTimeout(timer);
    pending = null;
    bridge.submitted({ username, password });
  };

  const considerSubmit = (scope: ParentNode) => {
    const found = credentialsIn(scope, rememberedUsername);
    if (!found) {
      // The first screen of a two-step sign-in: keep the name for the second.
      const named = fieldsIn(scope).find(
        (field) =>
          field instanceof HTMLInputElement &&
          field.type !== 'password' &&
          field.value !== '' &&
          kindOf(field) === 'username',
      );
      if (named) rememberedUsername = named.value.trim();
      return;
    }
    if (pending) clearTimeout(pending.timer);
    const href = view.location.href;
    pending = {
      ...found,
      href,
      timer: setTimeout(() => {
        if (!pending) return;
        // A form still there, still filled in, on the same address was refused.
        const gone =
          !pending.field.isConnected ||
          !isVisibleField(pending.field) ||
          pending.field.value === '' ||
          view.location.href !== pending.href;
        if (gone) report();
        else pending = null;
      }, SETTLE_MS),
    };
  };

  doc.addEventListener(
    'submit',
    (event) => {
      if (event.target instanceof HTMLFormElement) considerSubmit(event.target);
    },
    { capture: true },
  );
  // Many sign-ins are scripts behind a button, with no form to submit.
  doc.addEventListener(
    'click',
    (event) => {
      if (!isReal(event) || !(event.target instanceof Element)) return;
      const button = event.target.closest(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      );
      if (!button) return;
      const form =
        button instanceof HTMLButtonElement ||
        button instanceof HTMLInputElement
          ? button.form
          : button.closest('form');
      considerSubmit(form ?? doc);
    },
    { capture: true },
  );
  // Leaving at once is the usual way a sign-in succeeds.
  view.addEventListener('pagehide', report);

  // The page a form led to asks again: it didn't work, so there's nothing to save.
  view.addEventListener(
    'load',
    () => {
      setTimeout(() => {
        if (hasPasswordField(doc)) bridge.stillLogin();
      }, STILL_LOGIN_MS);
    },
    { once: true },
  );

  return {
    fill(fill) {
      menuOpen = false;
      if (!active?.isConnected) return;
      fillScope(scopeOf(active), fill, active);
    },
    closed() {
      menuOpen = false;
    },
  };
}
