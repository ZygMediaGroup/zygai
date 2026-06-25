# ZygAI

ZygAI is an open-source AI chat app with a React frontend, an Express API server, MySQL persistence, provider-based model routing, billing hooks, admin tools, and optional local RAG support.

The project is built to run as a full-stack web app, but most integrations are optional and configured through environment variables.

## Features

- AI chat interface with model/provider selection
- User accounts, authentication, sessions, and email verification
- Admin dashboard and model limit controls
- Stripe billing integration
- SMTP email support
- File upload and document handling
- Optional Exa, Google, Cloudflare, OpenRouter, Ollama, and custom provider integrations
- Optional standalone RAG server for local knowledge retrieval
- PWA support through Vite PWA

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Express
- MySQL
- Stripe
- Ollama/RAG support

## Requirements

- Node.js 20 or newer
- npm
- MySQL database
- Provider/API keys for whichever integrations you enable

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Edit `.env` with your own secrets, database URL, app URLs, and provider keys.

## Running Locally

Start the frontend:

```bash
npm run dev
```

Start the API server:

```bash
npm run server
```

Start the frontend and API server together:

```bash
npm run dev:full
```

Start the standalone RAG server:

```bash
npm run rag:server
```

Start everything together:

```bash
npm run rag:all
```

By default, the frontend runs on `http://localhost:5174` and the API server runs on `http://localhost:8085`.

## Scripts

```bash
npm run dev        # Start the Vite frontend
npm run server     # Start the Express API server
npm run dev:full   # Start frontend and API server
npm run rag:server # Start standalone RAG server
npm run rag:all    # Start frontend, API server, and RAG server
npm run build      # Build the production frontend
npm run preview    # Preview the production build
```

## Environment Variables

Use [.env.example](.env.example) as the main template.

Important configuration groups:

- App URLs: `APP_BASE_URL`, `API_BASE_URL`, `FRONTEND_URL`, `PUBLIC_APP_URL`
- Auth/security: `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS`
- Database: `MYSQL_URL`
- Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_GO`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- Providers: `OPENROUTER_API_KEY`, `EXA_API_KEY`, `GOOGLE_API_KEY`, `CLOUDFLARE_API_TOKEN`
- RAG/Ollama: `RAG_SERVER_URL`, `RAG_API_KEY`, `OLLAMA_BASE_URL`, `EMBEDDING_MODEL`

Never commit `.env` or real credentials.

## Database

SQL files are included for setup and migrations:

- `migration.sql`
- `updates.sql`
- `model_limits.sql`
- `music.sql`

Review these files before running them against a production database.

## RAG Server

The optional RAG server lives in `rag-server/`.

Create its environment file if needed:

```bash
cp rag-server/.env.example rag-server/.env
```

Then run:

```bash
npm run rag:server
```

The RAG server expects an Ollama-compatible embedding endpoint when local embeddings are enabled.

## Security Notes

Before deploying your own instance:

- Generate strong unique values for `JWT_SECRET` and `ENCRYPTION_KEY`.
- Rotate any credential that was ever committed, shared, or exposed.
- Keep uploads, logs, local databases, vector stores, and user memory files out of git.
- Configure CORS, app URLs, admin emails, and Stripe webhook secrets for your deployment.
- Do not reuse development secrets in production.

## Contributing

Contributions are welcome. Please keep changes focused, avoid committing secrets or generated runtime data, and run a production build before opening a pull request:

```bash
npm run build
```

## License

ZygAI is released under the MIT License. See [LICENSE](LICENSE).
