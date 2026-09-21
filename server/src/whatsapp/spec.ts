/**
 * Transport-agnostic message spec.
 *
 * Flow code emits these and never builds a WhatsApp payload itself. A thin
 * adapter in api.ts renders them for WhatsApp today; a native app or another
 * channel can render the same spec later without touching flow code.
 */

export interface Button {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

/**
 * `location_request` renders as WhatsApp's location_request_message: a native
 * "Send Location" button that opens the location sharing screen. The user can
 * share current location or pick a point on the map, and it comes back as a
 * normal inbound `location` message. No other buttons can accompany it.
 */
export type OutMessage =
  | { kind: 'text'; body: string }
  | { kind: 'location_request'; body: string }
  /**
   * One tappable link. WhatsApp allows a single URL button and it cannot be
   * combined with reply buttons, so it is always its own message.
   */
  | { kind: 'cta_url'; body: string; button: string; url: string }
  | { kind: 'buttons'; body: string; header?: string; footer?: string; buttons: Button[] }
  | {
      kind: 'list';
      body: string;
      header?: string;
      footer?: string;
      button: string;
      sections: ListSection[];
    }
  | { kind: 'location'; lat: number; lng: number; name?: string; address?: string };

export function buttons(ids: Array<[string, string?]>): Button[] {
  return ids.map(([id, title]) => ({ id, title: title ?? id }));
}
