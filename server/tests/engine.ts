import { setTransport, setTemplateTransport } from '../src/whatsapp/api';
import {
  makeMockSendMessage,
  makeMockSendTemplate,
  resetCapture,
  resetTemplateCapture,
  TEST_ADDRESS,
} from './harness';
import { setGeocoder } from '../src/lib/geocode';

export * from './harness';

/**
 * Call from beforeAll() in a suite. Installs the capture transports so nothing
 * reaches Meta: outbound specs land in messageLog, template sends in
 * templateLog.
 */
export function setupMockSendMessage(): void {
  resetCapture();
  resetTemplateCapture();
  setTransport(makeMockSendMessage());
  setTemplateTransport(makeMockSendTemplate());
  setGeocoder(async () => TEST_ADDRESS);
}
