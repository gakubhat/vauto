import { setTransport } from '../src/whatsapp/api';
import { makeMockSendMessage, resetCapture, TEST_ADDRESS } from './harness';
import { setGeocoder } from '../src/lib/geocode';

export * from './harness';

/**
 * Call from beforeAll() in a suite. Installs the capture transport so nothing
 * reaches Meta and every outbound message lands in messageLog.
 */
export function setupMockSendMessage(): void {
  resetCapture();
  setTransport(makeMockSendMessage());
  setGeocoder(async () => TEST_ADDRESS);
}
