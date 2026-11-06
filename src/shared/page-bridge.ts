import type { FieldGroup, FieldKind } from './form-fields';

/**
 * Messages a web page's preload may send. Kept zod-free for the preload
 * bundle.
 */

/**
 * "The user just activated a link to this address". It lets the main process
 * tell a real link click (which branches the trail) from redirects, form
 * posts and script navigations (which stay in place).
 */
export const LINK_ACTIVATED = 'page:link-activated';

/** Autoconsent in a frame asking for its rules or to run a rule step. */
export const AUTOCONSENT = 'page:autoconsent';

/** A mouse's back or forward button was pressed inside the page. */
export const NAVIGATION_BUTTON = 'page:navigation-button';

/** A trusted input/change event occurred; never includes field values. */
export const FORM_EDITED = 'page:form-edited';

/** An eligible ordinary click whose default navigation the preload canceled. */
export const BRANCH_LINK = 'page:branch-link';

/** The user clicked or pressed a key inside a frame; carries nothing else. */
export const FRAME_GESTURE = 'page:frame-gesture';

/** A link was dropped on the page and nothing in the page took it. */
export const LINK_DROPPED = 'page:link-dropped';

/** A file was dropped on the page and nothing in the page took it. */
export const FILE_DROPPED = 'page:file-dropped';

/** A new frame asking, once and synchronously, what applies to it. */
export const PAGE_SETTINGS = 'page:settings';

/** What a frame's preload has to enforce itself, before the page's scripts. */
export interface PageSettings {
  /** Tell scripts what the request headers already say. */
  privacySignal: boolean;
  /** This frame belongs to another site, and may not use its cookies. */
  blockCookies: boolean;
  /** Media waits until the user has touched the page. */
  blockAutoplay: boolean;
  /** No script will run, so `<noscript>` content has to show. */
  blockScripts: boolean;
  /**
   * Permissions, by the name the web knows them by, this frame's site hasn't
   * been answered about. Chromium can only say granted or denied, so without
   * this a site that checks first would think the user had refused.
   */
  undecided: string[];
  /** Splash may offer to fill and save what's typed in this frame's forms. */
  formAssist: boolean;
  /** This site's scripts may not open a floating video. */
  blockPictureInPicture: boolean;
}

/** The user clicked into a form field Splash can fill; may a menu open? */
export const FORM_ASK = 'page:form-ask';
/** The field's menu should close: typing, leaving the field, scrolling. */
export const FORM_DISMISS = 'page:form-dismiss';
/** An arrow key or Return pressed while the field's menu is open. */
export const FORM_KEY = 'page:form-key';
/** A sign-in was sent. Only ever sent when it was, and only by its own frame. */
export const FORM_SUBMITTED = 'page:form-submitted';
/** A page right after a sign-in asks for a password again: it didn't work. */
export const FORM_STILL_LOGIN = 'page:form-still-login';
/** Main to frame: put these values in the form the user is in. */
export const FORM_FILL = 'page:form-fill';
/** Main to frame: the field's menu has closed. */
export const FORM_CLOSED = 'page:form-closed';
/** A page asked for a passkey in a way the user would have to answer. */
export const PASSKEY_REQUESTED = 'page:passkey-requested';

/** The field a menu opens under, as a frame reports it. */
export interface FormFieldReport {
  group: FieldGroup;
  kind: FieldKind;
  /** Where the field is in the top frame's viewport; `null` if it can't tell. */
  rect: { x: number; y: number; width: number; height: number } | null;
  /** What's typed as the account's name, for a password made up on the spot. */
  username: string;
}

/** What a frame is told to fill. */
export type FormFill =
  | {
      group: 'login';
      username: string | null;
      password: string | null;
      /** A made-up password: only "new password" fields take it. */
      newPassword: string | null;
    }
  | {
      group: 'address';
      address: {
        name: string;
        organization: string;
        street: string;
        city: string;
        region: string;
        postalCode: string;
        country: string;
        tel: string;
        email: string;
      };
    }
  | {
      group: 'card';
      card: { name: string; number: string; expMonth: string; expYear: string };
    };
