import readline from 'readline';
import fs from 'fs';
import {
  DRIVER_A_PHONE,
  RIDER_PHONE,
  driverStep,
  installMock,
  messageLog,
  renderLog,
  riderStep,
  stateOf,
  truncateAll,
} from '../../tests/harness';

interface Args {
  phone: string;
  as: 'rider' | 'driver';
  fresh: boolean;
  script?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    phone: get('--phone') ?? (argv.includes('--driver') ? DRIVER_A_PHONE : RIDER_PHONE),
    as: (get('--as') as 'rider' | 'driver') ?? 'rider',
    fresh: argv.includes('--fresh'),
    script: get('--script'),
  };
}

async function handleLine(args: Args, line: string): Promise<void> {
  const from = messageLog.length;
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('/loc ')) {
    const [lat, lng] = trimmed.slice(5).split(',').map((n) => Number(n.trim()));
    if (args.as === 'rider') await riderStep({ location: { lat, lng } });
    else await driverStep(args.phone, { location: { lat, lng } });
  } else if (trimmed.startsWith('/img')) {
    await driverStep(args.phone, { imageUrl: 'https://example.com/kyc.jpg' });
  } else if (args.as === 'rider') {
    await riderStep({ text: trimmed });
  } else {
    await driverStep(args.phone, { text: trimmed });
  }

  for (const m of messageLog.slice(from)) {
    if (m.msg.kind === 'text') console.log(`  BOT: ${m.msg.body}`);
    else if (m.msg.kind === 'location_request')
      console.log(`  BOT: [Send Location button]\n       ${m.msg.body}`);
    else if (m.msg.kind === 'buttons') {
      console.log(`  BOT: ${m.msg.body}`);
      for (const b of m.msg.buttons) console.log(`       [${b.title}] -> ${b.id}`);
    } else if (m.msg.kind === 'list') {
      console.log(`  BOT: ${m.msg.body}`);
      for (const s of m.msg.sections) {
        for (const r of s.rows) console.log(`       - ${r.title} -> ${r.id}`);
      }
    } else {
      console.log(`  BOT: location ${m.msg.lat},${m.msg.lng}`);
    }
  }

  const s = await stateOf(args.phone);
  console.log(`  state: ${s?.state ?? 'none'}  role: ${s?.role ?? 'none'}`);
  console.log(`  data: ${JSON.stringify(s?.data ?? {})}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  installMock();

  if (args.fresh) {
    try {
      await truncateAll();
      console.log('(database cleared)');
    } catch (e) {
      console.log(`(could not clear: ${(e as Error).message})`);
    }
  }

  console.log(`\nSimulating ${args.as} on ${args.phone}`);
  console.log('Type a message, /loc 12.97,77.59 for a location, /img for an image, or /quit\n');

  if (args.script) {
    const lines = fs.readFileSync(args.script, 'utf8').split('\n');
    for (const line of lines) {
      console.log(`> ${line}`);
      await handleLine(args, line);
    }
    console.log('\n--- full log ---\n' + renderLog());
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(`${args.as}> `);
  rl.prompt();

  rl.on('line', async (line) => {
    if (line.trim() === '/quit') {
      console.log('\n--- full log ---\n' + renderLog());
      rl.close();
      return;
    }
    console.log(`> ${line}`);
    try {
      await handleLine(args, line);
    } catch (e) {
      console.error('  ERROR:', e);
    }
    rl.prompt();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
