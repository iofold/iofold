/**
 * Create E2E Test User in Clerk
 *
 * This script creates a test user in Clerk for E2E testing.
 * Run with: pnpm tsx scripts/create-e2e-test-user.ts
 *
 * @see https://clerk.com/docs/reference/backend-api/tag/Users#operation/CreateUser
 */
import 'dotenv/config'

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY

if (!CLERK_SECRET_KEY) {
  console.error('Error: CLERK_SECRET_KEY not found in environment')
  process.exit(1)
}

// IMPORTANT: Use +clerk_test suffix for test emails so 424242 verification code works
// See: https://clerk.com/docs/testing/test-emails-and-phones
const TEST_USER = {
  email_address: ['e2e+clerk_test@iofold.com'],
  password: 'E2eTestPassword123!',
  first_name: 'E2E',
  last_name: 'TestUser',
  skip_password_checks: true, // Skip password strength requirements for test user
}

async function createTestUser() {
  console.log('Creating E2E test user in Clerk...')

  try {
    const response = await fetch('https://api.clerk.com/v1/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_USER),
    })

    if (!response.ok) {
      const error = await response.json()

      // Check if user already exists
      if (error.errors?.[0]?.code === 'form_identifier_exists') {
        console.log('Test user already exists!')
        console.log('\nUse these credentials in .env.local:')
        console.log(`E2E_CLERK_USER_USERNAME=${TEST_USER.email_address[0]}`)
        console.log(`E2E_CLERK_USER_PASSWORD=${TEST_USER.password}`)
        return
      }

      console.error('Failed to create user:', JSON.stringify(error, null, 2))
      process.exit(1)
    }

    const user = await response.json()
    console.log('Test user created successfully!')
    console.log(`User ID: ${user.id}`)
    console.log(`Email: ${user.email_addresses[0]?.email_address}`)
    console.log('\nUpdate your .env.local with:')
    console.log(`E2E_CLERK_USER_USERNAME=${TEST_USER.email_address[0]}`)
    console.log(`E2E_CLERK_USER_PASSWORD=${TEST_USER.password}`)
  } catch (error) {
    console.error('Error creating test user:', error)
    process.exit(1)
  }
}

createTestUser()
