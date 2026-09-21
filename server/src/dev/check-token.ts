import { config } from '../config';
import { GRAPH_API } from '../whatsapp/api';

/**
 * Validates the WhatsApp access token against the Graph API.
 * Run: npm run check:whatsapp
 */
async function main(): Promise<void> {
  console.log(`phone number id : ${config.whatsappPhoneNumberId}`);
  console.log(`business phone  : ${config.whatsappBusinessPhone}`);
  console.log(`graph version   : ${config.whatsappApiVersion}\n`);

  const res = await fetch(`${GRAPH_API}/${config.whatsappPhoneNumberId}`, {
    headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
  });
  const body = (await res.json()) as Record<string, unknown>;

  if (res.ok) {
    console.log(`OK (${res.status})`);
    console.log(`  verified name : ${String(body.verified_name ?? '?')}`);
    console.log(`  display phone : ${String(body.display_phone_number ?? '?')}`);
    console.log(`  quality       : ${String(body.quality_rating ?? '?')}`);
    console.log('\nToken is valid. If sends still fail, check WHATSAPP_PHONE_NUMBER_ID.');
    return;
  }

  const err = (body.error ?? {}) as Record<string, unknown>;
  console.log(`FAILED (${res.status})`);
  console.log(`  code    : ${String(err.code ?? '?')}`);
  console.log(`  message : ${String(err.message ?? '?')}`);

  if (err.code === 190) {
    console.log('\nThe token is invalid or expired (most likely the 24-hour temporary one');
    console.log('from the App Dashboard). Generate a permanent token:');
    console.log('  business.facebook.com -> Business settings -> Users -> System users');
    console.log('  -> create/select a system user -> Add assets (your WhatsApp app)');
    console.log('  -> Generate new token -> permissions: whatsapp_business_messaging,');
    console.log('     whatsapp_business_management');
    console.log('\nThen set WHATSAPP_ACCESS_TOKEN in .env.');
    console.log('WARNING: .env has duplicate keys - dotenv uses the LAST occurrence.');
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
