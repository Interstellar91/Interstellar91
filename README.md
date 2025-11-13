# 🚀 AIMA Backend API

AI Marketing Assistant Backend Server

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL (via Supabase)
- Stripe Account
- Anthropic API Key

## 🛠️ Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Fill in your credentials
```

3. Setup database:
```bash
npx prisma migrate dev
npx prisma generate
```

4. Start development server:
```bash
npm run dev
```

Server runs on `http://localhost:3001`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/me` - Update profile
- `POST /api/auth/reset-password` - Request password reset

### Conversations
- `GET /api/conversations` - List all conversations
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations` - Create new conversation
- `PATCH /api/conversations/:id` - Update conversation
- `DELETE /api/conversations/:id` - Delete conversation

### Messages
- `POST /api/messages/:conversationId` - Send message

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign with AI strategy
- `PATCH /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `POST /api/campaigns/:id/generate-strategy` - Generate AI strategy

### Reports
- `GET /api/reports` - List reports
- `POST /api/reports/generate` - Generate report
- `GET /api/reports/:id` - Get report
- `DELETE /api/reports/:id` - Delete report

### Analytics
- `GET /api/analytics/dashboard` - Dashboard analytics
- `GET /api/analytics/usage` - Usage stats for period

### Users
- `PATCH /api/users/profile` - Update profile
- `POST /api/users/change-password` - Change password (client-side)
- `DELETE /api/users/account` - Delete account
- `GET /api/users/stats` - User stats

### Billing
- `POST /api/billing/create-checkout` - Create Stripe checkout
- `POST /api/billing/portal` - Billing portal session
- `GET /api/billing/subscription` - Current subscription

### Webhooks
- `POST /api/webhooks/stripe` - Stripe webhook handler

## 🧪 Testing

```bash
npm test
```

Stripe webhook testing:
```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

## 🚀 Deployment

```bash
npm run build
npm start
```

## 📝 License

MIT
