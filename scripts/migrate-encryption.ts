/**
 * Migration script to re-encrypt existing base64-encoded API keys with proper AES-GCM encryption
 *
 * Usage:
 *   npx tsx scripts/migrate-encryption.ts
 *
 * This script:
 * 1. Reads all integrations from the database
 * 2. Detects which ones use old base64 encoding (vs proper encryption)
 * 3. Re-encrypts them with AES-GCM
 * 4. Updates the database
 *
 * IMPORTANT: Backup your database before running this script!
 */

import { encryptAPIKey, isEncrypted } from '../src/utils/crypto';

interface Integration {
  id: string;
  workspace_id: string;
  platform: string;
  api_key_encrypted: string;
}

async function migrateEncryption(db: any, encryptionKey: string) {
  console.log('=== API Key Encryption Migration ===\n');

  // Fetch all integrations
  const result = await db.prepare(
    'SELECT id, workspace_id, platform, api_key_encrypted FROM integrations'
  ).all();

  const integrations = result.results as Integration[];
  console.log(`Found ${integrations.length} integration(s)\n`);

  if (integrations.length === 0) {
    console.log('No integrations to migrate. Exiting.');
    return;
  }

  let migratedCount = 0;
  let alreadyEncryptedCount = 0;
  let errorCount = 0;

  for (const integration of integrations) {
    console.log(`Processing ${integration.platform} integration ${integration.id}...`);

    try {
      // Check if already encrypted
      if (isEncrypted(integration.api_key_encrypted)) {
        console.log('  ✓ Already using proper encryption, skipping\n');
        alreadyEncryptedCount++;
        continue;
      }

      // Decode base64 to get plain text API key
      const plainTextKey = Buffer.from(integration.api_key_encrypted, 'base64').toString('utf-8');

      // Re-encrypt with proper AES-GCM
      const properlyEncrypted = await encryptAPIKey(plainTextKey, encryptionKey);

      // Update database
      await db.prepare(
        'UPDATE integrations SET api_key_encrypted = ?, updated_at = ? WHERE id = ?'
      ).bind(
        properlyEncrypted,
        new Date().toISOString(),
        integration.id
      ).run();

      console.log('  ✓ Migrated to AES-GCM encryption\n');
      migratedCount++;
    } catch (error) {
      console.error('  ✗ Failed:', (error as Error).message, '\n');
      errorCount++;
    }
  }

  console.log('=== Migration Complete ===');
  console.log(`Total integrations: ${integrations.length}`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Already encrypted: ${alreadyEncryptedCount}`);
  console.log(`Errors: ${errorCount}`);

  if (errorCount > 0) {
    console.log('\n⚠ Some migrations failed. Check error messages above.');
    process.exit(1);
  } else {
    console.log('\n✓ All integrations now use proper AES-GCM encryption');
  }
}

// For CLI usage
if (require.main === module) {
  console.log('This is a template script.');
  console.log('To use it, integrate with your D1 database connection.');
  console.log('\nExample usage in a Cloudflare Worker context:');
  console.log('');
  console.log('  import { migrateEncryption } from "./scripts/migrate-encryption";');
  console.log('  await migrateEncryption(env.DB, env.ENCRYPTION_KEY);');
  console.log('');
  console.log('Or create a one-time migration endpoint:');
  console.log('  POST /admin/migrate-encryption');
}

export { migrateEncryption };
