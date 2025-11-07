# API Tests

Automatiska tester för Quizter API:erna (Cloudflare Pages Functions).

## 🏃 Köra tester

### Kör alla API tester
```bash
npm run test:api
```

Detta kör automatiskt **alla** test-filer i `tests/api/` mappen.

### Kör enskilda tester
```bash
node tests/api/game-flow.test.js
node tests/api/error-handling.test.js
node tests/api/concurrent-operations.test.js
node tests/api/data-integrity.test.js
```

## 📋 Befintliga test-suiter

### 1. **game-flow.test.js**
End-to-end test av hela spelflödet:
- ✅ Skapa run
- ✅ Registrera participant
- ✅ Spela in svar
- ✅ Verifiera datapersistens
- 🧹 Städar upp alla skapade resurser

### 2. **error-handling.test.js**
Testar felhantering:
- ✅ Saknade required fields (400)
- ✅ Ogiltiga JSON payloads
- ✅ Non-existent resources (404)
- ✅ Method not allowed (405)
- 🧹 Ingen cleanup behövs (skapar ingen data)

### 3. **concurrent-operations.test.js**
Testar samtidiga operationer:
- ✅ 10 spelare joinar samtidigt
- ✅ Multipla svar skickas samtidigt
- ✅ Flera runs skapas samtidigt
- ✅ Verifierar inga dubbletter (race conditions)
- 🧹 Städar upp alla test-resurser

### 4. **data-integrity.test.js**
Testar dataintegritet:
- ✅ JSON fields bevaras korrekt
- ✅ Timestamps är korrekta
- ✅ Unique constraints (join codes)
- ✅ Delete operationer fungerar
- 🧹 Städar upp alla test-runs

## ➕ Lägga till nya tester

### Steg 1: Skapa test-fil
Skapa en ny fil i `tests/api/` med namnet `{testnamn}.test.js`:

```javascript
// tests/api/my-new-test.test.js

// Polyfill fetch for Node.js
if (typeof global.fetch === 'undefined') {
    const { default: fetch } = require('node-fetch');
    global.fetch = fetch;
}

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8788';

class MyNewTest {
    constructor() {
        this.testData = {
            // Spara IDs här för cleanup
        };
    }

    async makeRequest(path, options = {}) {
        const url = `${BASE_URL}${path}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        return response.json();
    }

    async testSomething() {
        console.log('🧪 Testing something...');
        
        // Din test-logik här
        
        console.log('✅ Test passed');
    }

    async cleanup() {
        console.log('🧹 Cleaning up test data...');
        
        try {
            // Radera alla skapade resurser här
            
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.warn('⚠️ Cleanup warning:', error.message);
        }
    }

    async run() {
        const startTime = Date.now();
        console.log('🚀 Starting My New Test...\n');

        try {
            await this.testSomething();
            // Lägg till fler test-metoder här

            const duration = Date.now() - startTime;
            console.log(`\n🎉 ALL TESTS PASSED! (${duration}ms)\n`);
            return true;

        } catch (error) {
            console.error('\n❌ TEST FAILED:', error.message);
            return false;

        } finally {
            // VIKTIGT: Cleanup körs alltid, även om test failar
            await this.cleanup();
        }
    }
}

// Export for programmatic use
module.exports = { MyNewTest };

// Run if called directly
if (require.main === module) {
    (async () => {
        const test = new MyNewTest();
        const success = await test.run();
        process.exit(success ? 0 : 1);
    })();
}
```

### Steg 2: Det är klart! 🎉

Master test scriptet (`scripts/run-all-tests.js`) hittar automatiskt alla `*.test.js` filer i `tests/api/` och kör dem.

Inget mer behöver göras - ditt nya test kommer automatiskt ingå när du kör:
```bash
npm run test:api
```

## 🚀 CI/CD Integration

Alla API tester körs automatiskt:
- **Före deploy:** `npm run predeploy` kör alla tester
- **GitHub Actions:** Testerna körs i deployment workflow

Om ett test failar så stoppas deployment automatiskt.

## ⚙️ Server krav

Testerna kräver att dev-servern körs:
```bash
npm run dev
```

Servern startar på `http://127.0.0.1:8788` och testerna ansluter automatiskt.

## 📝 Best Practices

1. **Använd descriptive namn** - Testa namn ska beskriva vad som testas
2. **Städa alltid upp** - Använd `finally` block för cleanup
3. **Testa edge cases** - Inte bara happy path
4. **Använd tydliga console logs** - Emoji + beskrivningar
5. **Return boolean** - `true` för success, `false` för failure
6. **Exit med rätt kod** - `process.exit(0)` för success, `1` för failure

## 🐛 Debugging

Om ett test failar:
1. Kör testet individuellt för att se exakt fel
2. Kolla att servern körs (`npm run dev`)
3. Verifiera att databasen är tom innan test
4. Använd `console.log` för att debugga

## 📊 Test Coverage

Aktuell coverage:
- ✅ Game flow (create → join → play → verify)
- ✅ Error handling (400, 404, 405 responses)
- ✅ Concurrency (race conditions, unique constraints)
- ✅ Data integrity (JSON preservation, timestamps)

Framtida tester:
- 🔜 Performance tests (response times)
- 🔜 Load tests (many concurrent users)
- 🔜 SSE real-time updates
- 🔜 Authentication/authorization
