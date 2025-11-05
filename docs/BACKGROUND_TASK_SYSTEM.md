# Background Task System - Architecture & Flow

## Overview

Quizter använder ett event-drivet background task system byggt på Cloudflare D1 och Server-Sent Events (SSE) för att hantera långvariga AI-operationer som fråggenerering, validering och emoji-regenerering.

## Architecture Components

### 1. Database (Cloudflare D1)

**Table: `background_tasks`**
```sql
CREATE TABLE background_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,        -- 'generation', 'validation', 'emoji-regeneration'
  status TEXT NOT NULL,            -- 'pending', 'processing', 'completed', 'failed'
  label TEXT,
  description TEXT,
  progress INTEGER DEFAULT 0,      -- 0-100
  total INTEGER DEFAULT 100,
  result TEXT,                     -- JSON med resultat/errors
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

### 2. API Endpoints

#### `/api/generateAIQuestions` (POST)
- Tar emot request för AI-fråggenerering
- Skapar task i D1 database
- Startar background processing med `context.waitUntil()`
- Returnerar `taskId` direkt (synkront svar)

#### `/api/subscribeToTask` (GET - SSE)
- Server-Sent Events endpoint för real-time task updates
- Query param: `taskId`
- Skickar events: `update`, `complete`, `error`, `timeout`
- Stänger connection automatiskt när task är klar

#### `/api/getBackgroundTasks` (GET)
- Hämtar task-lista för en användare eller alla (superuser)
- Query param: `userId` (optional)
- Query param: `limit` (optional, default: 100)

### 3. Frontend Services

#### `backgroundTaskService.js`
```javascript
// Hämta tasks för en user
fetchUserTasks(userId) → Promise<Task[]>

// Subscribe till en specifik task (SSE)
subscribeToTask(taskId, onUpdate, onComplete, onError) → cleanup()

// Subscribe till user's tasks (polling var 5:e sekund)
subscribeToUserTasks(userId, callback) → cleanup()

// Subscribe till alla tasks (superuser, polling var 3:e sekund)
subscribeToAllTasks(callback) → cleanup()
```

#### `taskService.js`
```javascript
// Subscribe till task updates
subscribeToTask(taskId, onUpdate, onComplete, onError) → cleanup()

// Vänta på task completion
waitForCompletion(taskId) → Promise<Task>
```

### 4. React Context

#### `BackgroundTaskContext.js`
- Hanterar task state för hela appen
- Auto-subscribe till user's tasks
- Superuser: Auto-subscribe till alla tasks
- Notifications & toasts när tasks slutförs

---

## Task Flow: AI Question Generation

### Step 1: User Initiates Generation

**Frontend** (`AdminQuestionsPage.js`):
```javascript
const handleGenerateAIQuestions = async () => {
  const response = await aiService.startAIGeneration({
    amount: 10,
    category: 'Historia',
    ageGroup: 'adults',
    difficulty: 'medium',
    provider: 'openai'
  });
  
  // Response innehåller taskId
  const { taskId } = response;
  
  // Subscribe till task updates via SSE
  backgroundTaskService.subscribeToTask(
    taskId,
    (task) => updateProgressBar(task.progress),
    (task) => showCompletionDialog(task),
    (error) => showErrorDialog(error)
  );
};
```

### Step 2: API Creates Task

**Backend** (`/api/generateAIQuestions`):
```javascript
export async function onRequestPost(context) {
  const { request, env } = context;
  const { amount, category, provider } = await request.json();
  const userEmail = request.headers.get('x-user-email');
  
  // 1. Skapa task i D1
  const taskId = `task_${Date.now()}_${randomId()}`;
  await env.DB.prepare(`
    INSERT INTO background_tasks (
      id, user_id, task_type, status, description,
      progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    taskId,
    userEmail,
    'generation',
    'processing',
    `Genererar ${amount} frågor om ${category}`,
    0,
    Date.now(),
    Date.now()
  ).run();
  
  // 2. Starta background processing
  context.waitUntil(
    generateQuestionsInBackground(env, taskId, { amount, category, provider })
  );
  
  // 3. Returnera taskId direkt (ej blocking)
  return new Response(JSON.stringify({ 
    success: true, 
    taskId 
  }));
}
```

### Step 3: Background Processing

**Backend** (background function):
```javascript
async function generateQuestionsInBackground(env, taskId, params) {
  try {
    // Progress: 10%
    await updateTaskProgress(env.DB, taskId, 10, 'Preparing AI request...');
    
    // Progress: 30%
    await updateTaskProgress(env.DB, taskId, 30, 'Generating with OpenAI...');
    const questions = await generateWithOpenAI(apiKey, params);
    
    // Progress: 70%
    await updateTaskProgress(env.DB, taskId, 70, 'Saving to database...');
    const saved = await saveQuestionsToDatabase(env.DB, questions, params);
    
    // Progress: 100% - Complete
    await completeTask(env.DB, taskId, {
      success: true,
      questionsGenerated: saved.length,
      questions: saved
    });
    
  } catch (error) {
    await failTask(env.DB, taskId, error.message);
  }
}
```

### Step 4: Real-time Updates via SSE

**Frontend** (automatic via EventSource):
```javascript
// Browser öppnar SSE connection
const eventSource = new EventSource(`/api/subscribeToTask?taskId=${taskId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'update':
      // Progress update: 10% → 30% → 70%
      onUpdate(data.task);
      break;
    
    case 'complete':
      // Task klar!
      onComplete(data.task);
      eventSource.close();
      break;
    
    case 'error':
      // Task misslyckades
      onError(data.error);
      eventSource.close();
      break;
  }
};
```

**Backend** (`/api/subscribeToTask`):
```javascript
export async function onRequestGet(context) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // Poll database var 2:e sekund
  const checkTask = async () => {
    const task = await env.DB.prepare(
      'SELECT * FROM background_tasks WHERE id = ?'
    ).bind(taskId).first();
    
    // Skicka SSE event
    await writer.write(
      new TextEncoder().encode(`data: ${JSON.stringify({
        type: 'update',
        task: {
          status: task.status,
          progress: task.progress,
          description: task.description
        }
      })}\n\n`)
    );
    
    // Stop om klar/misslyckad
    if (task.status === 'completed' || task.status === 'failed') {
      await writer.close();
      return true;
    }
  };
  
  // Check immediately + var 2:e sekund
  const interval = setInterval(checkTask, 2000);
  
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### Step 5: SuperUser Overview

**Frontend** (`/superuser/tasks`):
```javascript
// BackgroundTaskContext auto-subscribes
useEffect(() => {
  // Poll alla tasks var 3:e sekund
  const unsubscribe = backgroundTaskService.subscribeToAllTasks((tasks) => {
    setAllTasks(tasks); // Live updates!
  });
  
  return unsubscribe;
}, []);
```

Visar:
- ✅ Alla aktiva tasks från alla användare
- ✅ Real-time progress bars
- ✅ Status (processing, completed, failed)
- ✅ Duration calculations
- ✅ Result details
- ✅ Filter & search

---

## Task States & Transitions

```
pending → processing → completed
                    ↓
                  failed
```

### Status Descriptions

- **`pending`**: Task skapad men ej startad
- **`processing`**: Task körs i bakgrunden
- **`completed`**: Task slutförd framgångsrikt
- **`failed`**: Task misslyckades med fel

### Progress Updates

Progress rapporteras som 0-100:
- **0-10%**: Initiering, preparation
- **10-30%**: AI API request skickad
- **30-70%**: AI svar mottaget, parsing
- **70-100%**: Databas-operationer, cleanup
- **100%**: Task completed

---

## Event Types (SSE)

### `update`
Skickas när progress/status ändras:
```json
{
  "type": "update",
  "task": {
    "id": "task_1234",
    "status": "processing",
    "progress": 30,
    "description": "Generating with OpenAI..."
  }
}
```

### `complete`
Skickas när task slutförs:
```json
{
  "type": "complete",
  "task": {
    "id": "task_1234",
    "status": "completed",
    "progress": 100,
    "result": {
      "questionsGenerated": 10,
      "questions": [...]
    }
  }
}
```

### `error`
Skickas vid fel:
```json
{
  "type": "error",
  "error": "API key not configured for provider: openai"
}
```

### `timeout`
Skickas om task tar för lång tid (5 min):
```json
{
  "type": "timeout",
  "error": "Task monitoring timeout"
}
```

---

## Best Practices

### Backend
- ✅ Använd `context.waitUntil()` för background processing
- ✅ Uppdatera progress regelbundet (10%, 30%, 70%, 100%)
- ✅ Använd try/catch och `failTask()` vid errors
- ✅ Logga alla steg för debugging
- ✅ Stäng SSE connections när task är klar

### Frontend
- ✅ Använd SSE för enskilda tasks (event-driven)
- ✅ Använd polling för task-listor (enklare, mindre kritiskt)
- ✅ Cleanup event listeners i `useEffect` return
- ✅ Visa progress visuellt (progress bars)
- ✅ Hantera errors gracefully med dialogs/toasts

### Database
- ✅ Indexera `user_id` och `created_at` för snabba queries
- ✅ Spara results som JSON i `result` kolumn
- ✅ Använd timestamps (INTEGER) för bättre prestanda
- ✅ Rensa gamla completed tasks periodiskt

---

## Troubleshooting

### Task fastnar i "processing"
- Kolla backend logs för errors
- Verifiera att `completeTask()` eller `failTask()` anropas
- Kontrollera API keys är korrekt konfigurerade

### SSE connection stängs för tidigt
- Öka timeout i `/api/subscribeToTask` (maxAttempts)
- Kolla nätverks-stabilitet
- Verifiera att backend uppdaterar task status korrekt

### Progress uppdateras inte
- Verifiera att `updateTaskProgress()` anropas
- Kolla att SSE polling funkar (2s interval)
- Testa direkt mot `/api/getBackgroundTasks`

### Tasks visas inte på /superuser/tasks
- Verifiera superuser authentication (`isSuperUser` flag)
- Kolla att `/api/getBackgroundTasks` returnerar data
- Kontrollera BackgroundTaskContext subscription

---

## Future Improvements

### Short-term
- [ ] WebSocket support för ännu snabbare updates
- [ ] Task cancellation support
- [ ] Bulk operations (cancel/retry multiple tasks)
- [ ] Task retry mechanism med exponential backoff

### Long-term
- [ ] Cloudflare Durable Objects för distributed task queue
- [ ] Task scheduling (cron-style)
- [ ] Task dependencies (task chains)
- [ ] Resource limits & throttling per user
- [ ] Detailed task metrics & analytics
