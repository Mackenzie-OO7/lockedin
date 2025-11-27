#!/usr/bin/env node
/**
 * Post-build script for Scaffold Stellar
 * Automatically generates contract import files in apps/web/src/contracts/
 * after running `stellar scaffold build --build-clients`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Read environments.toml to get contract configuration
const environmentsPath = path.join(rootDir, 'environments.toml');
const environmentsContent = fs.readFileSync(environmentsPath, 'utf-8');

// Parse staging environment contract IDs
const stagingContractMatch = environmentsContent.match(
  /\[staging\.contracts\.(\w+)\]\s*id\s*=\s*"([^"]+)"/g
);

if (!stagingContractMatch) {
  console.log('⚠️  No staging contracts found in environments.toml');
  process.exit(0);
}

const contracts = [];
for (const match of stagingContractMatch) {
  const nameMatch = match.match(/\[staging\.contracts\.(\w+)\]/);
  const idMatch = match.match(/id\s*=\s*"([^"]+)"/);

  if (nameMatch && idMatch) {
    contracts.push({
      name: nameMatch[1],
      id: idMatch[1],
    });
  }
}

console.log(`📦 Found ${contracts.length} contract(s) to generate import files for`);

// Generate import files for each contract
const contractsDir = path.join(rootDir, 'apps/web/src/contracts');

// Ensure contracts directory exists
if (!fs.existsSync(contractsDir)) {
  fs.mkdirSync(contractsDir, { recursive: true });
}

for (const contract of contracts) {
  const contractFile = path.join(contractsDir, `${contract.name}.ts`);

  const content = `import * as Client from "${contract.name}";
import { rpcUrl, networkPassphrase } from "./util";

const contractId = "${contract.id}";

export default new Client.Client({
  contractId,
  networkPassphrase,
  rpcUrl,
});

export * from "${contract.name}";
`;

  fs.writeFileSync(contractFile, content);
  console.log(`✅ Generated ${contract.name}.ts`);
}

console.log(`\n✨ Contract import files generated successfully!`);
