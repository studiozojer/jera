#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { JeraClient, intentId } from './client.mjs';

const [kind, operation, file, suppliedId] = process.argv.slice(2);
if (!['query', 'mutate'].includes(kind) || !operation || !file) {
  console.error('Usage: JERA_ORIGIN=https://… JERA_TOKEN=… node scripts/agent.mjs query|mutate operation args.json|- [intent-id]');
  console.error('Read modules with armillariesList/modulesList; capture an idea; use tasksList → claim → complete to organize it. JSON goes to stdout.');
  process.exitCode = 2;
} else {
  try {
    if (!process.env.JERA_ORIGIN || !process.env.JERA_TOKEN) throw new Error('JERA_ORIGIN and JERA_TOKEN are required.');
    let input = '';
    if (file === '-') { process.stdin.setEncoding('utf8'); for await (const chunk of process.stdin) input += chunk; }
    else input = await readFile(file, 'utf8');
    const args = JSON.parse(input);
    const client = new JeraClient(process.env.JERA_ORIGIN, process.env.JERA_TOKEN);
    const id = suppliedId ?? intentId();
    // Print the retry key before sending: a lost reply must not cause a new intent.
    if (kind === 'mutate') console.error(`intent-id: ${id}`);
    console.log(JSON.stringify(kind === 'query' ? await client.query(operation, args) : await client.mutate(operation, args, id), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code ?? 'CLIENT_ERROR', message: error.message }));
    process.exitCode = 1;
  }
}
