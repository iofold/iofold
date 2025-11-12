# Setup Instructions

This document contains the manual setup steps required to complete the project setup.

## Prerequisites

1. Cloudflare account with Workers and D1 access
2. Cloudflare API token (https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

## Manual Steps Required

### 1. Create D1 Database

You need Cloudflare authentication to create the D1 database. Run:

```bash
# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN=your-token-here

# Create the D1 database
npx wrangler d1 create iofold_validation
```

This will output something like:
```
✅ Successfully created DB 'iofold_validation'

[[d1_databases]]
binding = "DB"
database_name = "iofold_validation"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. Update wrangler.toml

Copy the `database_id` from the output above and replace `REPLACE_WITH_ACTUAL_DATABASE_ID` in `wrangler.toml`.

### 3. Apply Database Schema

Run the following commands to apply the schema to both local and remote databases:

```bash
npx wrangler d1 execute iofold_validation --local --file=./schema.sql
npx wrangler d1 execute iofold_validation --remote --file=./schema.sql
```

### 4. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your actual API keys:

```bash
cp .env.example .env
# Edit .env with your actual keys
```

Required keys:
- `LANGFUSE_PUBLIC_KEY`: Your Langfuse public key
- `LANGFUSE_SECRET_KEY`: Your Langfuse secret key
- `LANGFUSE_BASE_URL`: Langfuse base URL (default: https://cloud.langfuse.com)
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude

### 5. Verify Setup

Test the setup by running the development server:

```bash
npm run dev
```

Then test the health endpoint:
```bash
curl http://localhost:8787/health
```

Expected response: `OK`

## Next Steps

Once setup is complete, you can proceed with Task 2: Langfuse Adapter Prototype.
