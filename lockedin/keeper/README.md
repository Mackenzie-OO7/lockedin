# LockedIn Keeper Service

Automated bill payment service for LockedIn smart contract.

## What it does

- **Runs daily** at a scheduled time (default: 12:00 PM UTC)
- **Checks all cycles** for bills due today
- **Automatically pays** bills using admin privileges
- **Logs all activity** to console

## Setup

1. **Install dependencies**
   ```bash
   cd keeper
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` file** with your admin secret key:
   ```env
   ADMIN_SECRET_KEY=YOUR_ADMIN_SECRET_KEY_HERE
   ```

   The other values are already configured for testnet.

## Usage

### Run the keeper service (scheduled mode)
```bash
npm start
```

This will start the cron job that runs daily at 12:00 PM UTC.

### Test manually (run once immediately)
```bash
npm start -- --now
```

This will check for due bills and process payments immediately, then exit.

### Development mode (with auto-reload)
```bash
npm run dev
```

## Configuration

Edit `.env` to customize:

- `ADMIN_SECRET_KEY` - Your admin account secret key (required)
- `CRON_SCHEDULE` - When to run (default: `0 12 * * *` = daily at 12:00 PM UTC)
- `NOTIFICATION_WINDOW_HOURS` - Hours before due date to flag bills (default: 24)

### Cron Schedule Examples

- `0 12 * * *` - Every day at 12:00 PM UTC
- `0 */6 * * *` - Every 6 hours
- `*/30 * * * *` - Every 30 minutes
- `0 0 * * *` - Every day at midnight UTC

## Security Notes

⚠️ **IMPORTANT**: Never commit your `.env` file or share your admin secret key!

The admin secret key has full control over bill payments across all users.

## Logs

The keeper service logs:
- Timestamp of each run
- Number of cycles checked
- Bills due today
- Payment success/failure for each bill
- Summary statistics

Example output:
```
=== Processing Due Bills ===
Timestamp: 2024-01-15T12:00:00.000Z

Found 5 cycle(s)

Bill due today: Rent (ID: 1)
Amount: 1200 USDC
✅ Bill 1 paid successfully

Bill due today: Internet (ID: 3)
Amount: 80 USDC
✅ Bill 3 paid successfully

=== Summary ===
Processed: 2
Paid: 2
Failed: 0
```
