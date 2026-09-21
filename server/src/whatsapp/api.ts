import { config } from '../config';
import type { OutMessage } from './spec';

export const GRAPH_API = `https://graph.facebook.com/${config.whatsappApiVersion}`;

export interface WhatsAppPayload {
  messaging_product: 'whatsapp';
  recipient_type?: 'individual';
  to: string;
  type: 'text' | 'interactive' | 'location';
  text?: { body: string; preview_url?: boolean };
  interactive?: {
    type: 'button' | 'list' | 'location_request_message' | 'cta_url';
    header?: { type: 'text'; text: string };
    body?: { text: string };
    footer?: { text: string };
    action: {
      name?: string;
      parameters?: { display_text: string; url: string };
      button?: string;
      buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
      sections?: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
  };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export function renderWhatsApp(to: string, msg: OutMessage): WhatsAppPayload {
  const base = { messaging_product: 'whatsapp' as const, recipient_type: 'individual' as const, to };

  if (msg.kind === 'text') {
    return { ...base, type: 'text', text: { body: msg.body } };
  }

  if (msg.kind === 'cta_url') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: msg.body },
        action: {
          name: 'cta_url',
          parameters: { display_text: msg.button.slice(0, 20), url: msg.url },
        },
      },
    };
  }

  if (msg.kind === 'location_request') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: msg.body },
        action: { name: 'send_location' },
      },
    };
  }

  if (msg.kind === 'buttons') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(msg.header ? { header: { type: 'text', text: msg.header } } : {}),
        body: { text: msg.body },
        ...(msg.footer ? { footer: { text: msg.footer } } : {}),
        action: {
          buttons: msg.buttons.slice(0, 3).map((b) => ({
            type: 'reply' as const,
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    };
  }

  if (msg.kind === 'list') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(msg.header ? { header: { type: 'text', text: msg.header } } : {}),
        body: { text: msg.body },
        ...(msg.footer ? { footer: { text: msg.footer } } : {}),
        action: {
          button: msg.button,
          sections: msg.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    };
  }

  return {
    ...base,
    type: 'location',
    location: {
      latitude: msg.lat,
      longitude: msg.lng,
      ...(msg.name ? { name: msg.name } : {}),
      ...(msg.address ? { address: msg.address } : {}),
    },
  };
}

export type Transport = (to: string, msg: OutMessage) => Promise<Response>;

async function defaultTransport(to: string, msg: OutMessage): Promise<Response> {
  const payload = renderWhatsApp(to, msg);
  const res = await fetch(`${GRAPH_API}/${config.whatsappPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsappAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('[WHATSAPP SEND FAILED]', to, res.status, await res.text());
  }
  return res as unknown as Response;
}

let transport: Transport = defaultTransport;

/**
 * Swap the outbound transport. The test harness and CLI simulator install a
 * capture here; nothing else needs to know. Avoids monkey-patching module
 * exports, which ESM (vitest, tsx) makes non-writable.
 */
export function setTransport(fn: Transport): void {
  transport = fn;
}

export function resetTransport(): void {
  transport = defaultTransport;
}

export async function sendMessage(to: string, msg: OutMessage): Promise<Response> {
  return transport(to, msg);
}

/**
 * Utility template send. Required for reaching a driver who has not messaged
 * within 24 hours - outside the session window only templates are delivered.
 * TODO: register the template in Meta and pass its name here.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: Array<Record<string, unknown>> = [],
): Promise<Response> {
  const res = await fetch(`${GRAPH_API}/${config.whatsappPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsappAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  });
  if (!res.ok) {
    console.error('[WHATSAPP TEMPLATE FAILED]', to, res.status, await res.text());
  }
  return res as unknown as Response;
}
