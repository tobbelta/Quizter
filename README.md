# Quizter - AI-Powered Quiz Platform

Quizter är en modern quizplattform byggd med Cloudflare Pages och AI-genererade frågor.

## 🚀 Teknisk Stack

- **Frontend**: React 18 med React Router 6
- **Styling**: TailwindCSS + Neubrutalism design
- **Backend**: Cloudflare Pages Functions (serverless)
- **Database**: Cloudflare D1 (SQL)
- **AI Providers**: OpenAI, Google Gemini, Anthropic Claude, Mistral
- **Deployment**: Cloudflare Pages med GitHub Actions
- **Custom Domain**: qztr.se

## 📁 Projekt Struktur

```
Quizter/
├── functions/               # Cloudflare Pages Functions (API endpoints)
│   └── api/
│       ├── isSuperuser.js         # Superuser authentication
│       ├── generateAIQuestions.js # AI question generation (background tasks)
│       ├── getAIStatus.js         # Check AI provider availability
│       ├── listQuestions.js       # Fetch all questions from D1
│       ├── getBackgroundTasks.js  # Get user's background tasks
│       └── subscribeToTask.js     # SSE endpoint for real-time task updates
├── migrations/              # D1 database migrations
│   ├── 001_create_questions_table.sql
│   └── 002_create_background_tasks_table.sql
├── src/
│   ├── components/          # React components
│   ├── views/
│   │   ├── SuperUserTasksPage.js  # Background task monitoring
│   │   └── ...
│   ├── services/
│   │   ├── backgroundTaskService.js  # SSE & polling for tasks
│   │   └── taskService.js            # Task subscription wrapper
│   └── context/
│       └── BackgroundTaskContext.js  # Global task state management
├── docs/                    # Dokumentation
│   ├── BACKGROUND_TASK_SYSTEM.md    # Background task architecture
│   └── D1_DATABASE_SETUP.md         # Database setup guide
├── wrangler.toml           # Cloudflare configuration
├── cloudflare.toml         # Additional Cloudflare config
└── .github/
    └── workflows/
        └── deploy.yml      # Auto-deployment workflow
```

## 🎯 Features

### AI Question Generation
- **4 AI Providers**: OpenAI (gpt-4o-mini), Gemini (1.5-flash), Anthropic (claude-3.5-sonnet), Mistral (mistral-small-latest)
- **Random Provider**: Automatically selects from available providers
- **Background Processing**: Long-running tasks don't block UI
- **Real-time Progress**: Server-Sent Events (SSE) for live updates

### Background Task System
- **Event-driven**: SSE for real-time task updates (no polling!)
- **D1 Database**: Persistent task storage with progress tracking
- **Superuser Dashboard**: Monitor all tasks across all users
- **Status Tracking**: Pending → Processing → Completed/Failed

### Database
- **Two D1 Databases**:
  - Production: `quizter-db` (8b90c5aa-c172-469f-b852-3662b7a717bf)
  - Preview: `quizter-db-preview` (f0c0f1b9-9955-4f99-bd49-965249967fec)
- **Tables**: `questions`, `background_tasks`
- **Migrations**: SQL files in `/migrations/`

## 🛠️ Development

### Prerequisites
```bash
npm install
```

### Environment Variables

Create `.dev.vars` in root:
```bash
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
SUPERUSER_EMAIL=your-email@example.com
```

### Local Development

```bash
# Start dev server with Wrangler
npm run dev
```

This starts:
- React dev server (hot reload)
- Cloudflare Pages Functions locally
- D1 database (local SQLite)

### Database Setup

**Production Database:**
```bash
npx wrangler d1 execute quizter-db --remote --file=migrations/001_create_questions_table.sql
npx wrangler d1 execute quizter-db --remote --file=migrations/002_create_background_tasks_table.sql
```

**Preview Database:**
```bash
npx wrangler d1 execute quizter-db-preview --remote --file=migrations/001_create_questions_table.sql
npx wrangler d1 execute quizter-db-preview --remote --file=migrations/002_create_background_tasks_table.sql
```

## 🚀 Deployment

### Automatic Deployment (GitHub Actions)

Every push to any branch triggers automatic deployment:

- `main` → Production (https://quizter.pages.dev)
- `staging` → Staging preview
- `feature/*` → Feature preview

**Secrets Configuration:**

1. Go to Cloudflare Dashboard → Workers & Pages → quizter → Settings → Variables and Secrets
2. Add encrypted secrets for **both** Production and Preview:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `MISTRAL_API_KEY`
   - `SUPERUSER_EMAIL`

### Manual Deployment

```bash
# Deploy to production
npm run deploy

# Deploy specific environment
npx wrangler pages deploy build --project-name=quizter
```

## 📖 API Endpoints

### Authentication
- `POST /api/isSuperuser` - Check if user is superuser

### AI Question Generation
- `POST /api/generateAIQuestions` - Start AI generation task
  ```json
  {
    "amount": 10,
    "category": "Geografi",
    "ageGroup": "adults",
    "difficulty": "medium",
    "provider": "openai"  // or "gemini", "anthropic", "mistral", "random"
  }
  ```
  Returns: `{ taskId: "task_..." }`

- `GET /api/getAIStatus` - Check AI provider availability

### Questions
- `GET /api/listQuestions` - Get all questions from D1

### Background Tasks
- `GET /api/getBackgroundTasks?userId=email@example.com` - Get user's tasks
- `GET /api/subscribeToTask?taskId=task_123` - SSE endpoint for real-time updates

## 🔐 Superuser Access

Superuser access is controlled via the `SUPERUSER_EMAIL` environment variable.

**Set in Cloudflare Dashboard:**
1. Go to Workers & Pages → quizter → Settings → Variables
2. Add `SUPERUSER_EMAIL` = `your-email@example.com`
3. Set for both Production and Preview environments

**Superuser features:**
- `/superuser/tasks` - Monitor all background tasks
- View all users' tasks in real-time
- Filter by status, user, task type

## 📚 Documentation

Detailed documentation is available in `/docs/`:

- **[AI_QUESTION_GENERATION.md](docs/AI_QUESTION_GENERATION.md)** ⭐ - AI question generation and categorization
  - **Åldersgrupper**: Children (6-12, svensk fokus), Youth (13-25, global fokus), Adults (25+, svensk fokus)
  - **Språk**: Alla frågor i BÅDE svenska OCH engelska
  - **Kategorier**: Geografi, Historia, Sport, Sociala Medier, etc.
  - 4 AI providers (OpenAI, Gemini, Anthropic, Mistral)
  - Request/response examples
  - Best practices

- **[BACKGROUND_TASK_SYSTEM.md](docs/BACKGROUND_TASK_SYSTEM.md)** - Complete background task architecture
  - Event-driven design with SSE
  - Task flow diagrams
  - Code examples
  - Best practices

- **[D1_DATABASE_SETUP.md](docs/D1_DATABASE_SETUP.md)** - Database configuration guide
  - Production vs Preview databases
  - Migration commands
  - Table schemas

## 🌐 Custom Domain

The project is configured for the custom domain `qztr.se`.

**DNS Configuration (when ready):**
1. Add CNAME record: `qztr.se` → `quizter.pages.dev`
2. Cloudflare will automatically provision SSL certificate

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 🐛 Troubleshooting

### Task not updating in real-time
- Check SSE connection in DevTools Network tab
- Verify `/api/subscribeToTask` returns `text/event-stream`
- Ensure task is being updated in D1 database

### API key errors
- Verify secrets are set in Cloudflare Dashboard
- Check both Production AND Preview environments
- Restart deployment after adding secrets

### Database errors
- Ensure migrations have been run
- Verify D1 bindings in Cloudflare Dashboard (Settings → Functions → D1 database bindings)
- Check database IDs match in `wrangler.toml`

## 📝 Branch Strategy

- `main` - Production (https://quizter.pages.dev)
- `staging` - Staging environment for testing
- `feature/*` - Feature branches (get preview URLs)

## 🔄 Migration from Firebase

This project was migrated from Firebase/Google Cloud to Cloudflare:

**Removed:**
- Firebase Hosting, Firestore, Cloud Functions
- Google Cloud dependencies
- All Firebase-related code (111 files changed)

**Replaced with:**
- Cloudflare Pages + Functions
- Cloudflare D1 (SQL database)
- Server-Sent Events (SSE) for real-time updates

## 📄 License

See [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Cloudflare Pages**
