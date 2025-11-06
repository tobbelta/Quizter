# Create GitHub Issues for Milestones 2-4
# Run this from the repository root: .\scripts\create-remaining-issues.ps1

Write-Host "`n=== Creating GitHub Issues for Milestones 2-4 ===" -ForegroundColor Cyan
Write-Host "Repository: tobbelta/Quizter`n" -ForegroundColor Yellow

# Check authentication
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}

# ==========================================
# MILESTONE 2: USER INTERACTION & FEEDBACK
# ==========================================
Write-Host "`n📋 MILESTONE 2: User Interaction & Feedback" -ForegroundColor Magenta

Write-Host "`n🔹 EPIC: User Interaction Features" -ForegroundColor Cyan
gh issue create --title "[EPIC] User Interaction Features" --body @"
## Epic Overview
Implement user-facing features that allow players to report problematic questions, provide feedback, and trigger quality improvements through batch validation.

## Sub-tasks
- [ ] Question Reporting System
- [ ] User Feedback System (👍👎)
- [ ] Batch Validation Trigger

## Acceptance Criteria
- ✅ Players can report questions with reasons
- ✅ Reported questions automatically quarantined
- ✅ Players can give thumbs up/down feedback
- ✅ Feedback tracked and stored
- ✅ Batch validation triggered by report threshold

## Labels
epic, frontend, backend, priority-high

## Milestone
Milestone 2: User Interaction & Feedback

## Documentation
[AI_QUESTION_GENERATION.md - User Reporting](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#76-user-reporting-användarrapportering)
"@

Write-Host "  ├─ Feature: Question Reporting System" -ForegroundColor Blue
gh issue create --title "Question Reporting System" --body @"
## Description
Allow players to report problematic questions during gameplay with automatic quarantine and admin notification.

**Part of:** [EPIC] User Interaction Features

## Reporting Flow
1. Player sees "Report question" button after answering
2. Select reason: "Felaktig fakta", "Otydlig fråga", "Olämpligt innehåll", "Annat"
3. Optional: Add comment (max 500 chars)
4. Submit → Question quarantined immediately

## Automatic Actions
- Set 'status = "quarantined"'
- Set 'reported = true'
- Increment 'report_count'
- Store report details in 'reports' table:
  - Fields: user_id, question_id, reason, comment, timestamp
- Add to high-priority review queue

## Report Threshold
- **3+ reports**: Trigger batch validation (10-50 similar questions)
- **5+ reports**: Auto-disable question (even if manually approved)
- **10+ reports**: Flag for urgent admin review

## UI Requirements
- Report button visible after answer shown
- Simple modal with reason selection
- Success message after submission
- Cannot report same question twice (same user)

## Acceptance Criteria
- [ ] Report button implemented in question view
- [ ] Modal with reason selection working
- [ ] Questions automatically quarantined on report
- [ ] Report count tracked correctly
- [ ] Batch validation triggered at threshold
- [ ] Admin sees reports in review queue
- [ ] Cannot submit duplicate reports

## Labels
feature, frontend, backend, priority-high

## Documentation
[User Reporting Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#76-user-reporting-användarrapportering)
"@

Write-Host "  ├─ Feature: User Feedback System" -ForegroundColor Blue
gh issue create --title "User Feedback System (👍👎)" --body @"
## Description
Implement thumbs up/down feedback system that players can use to rate questions after answering.

**Part of:** [EPIC] User Interaction Features

## Feedback Flow
1. Player answers question
2. Correct/incorrect answer shown
3. **5-second window** to give feedback (👍 or 👎)
4. Feedback saved, window closes
5. Next question loads

## Feedback Storage
Store in 'question_feedback' table:
- 'question_id'
- 'user_id' (if logged in, null if anonymous)
- 'feedback': "positive" or "negative"
- 'timestamp'

Update question stats:
- Increment 'feedback_positive' or 'feedback_negative'
- Recalculate 'feedback_ratio': 'positive / (positive + negative)'

## Feedback Ratio Impact
- **>0.8**: Great question (boost in popularity_score)
- **0.5-0.8**: Normal question
- **<0.5**: Poor question (flag for review if <0.3 with 20+ votes)

## UI Requirements
- 👍👎 buttons appear after answer shown
- 5-second countdown timer
- Visual feedback when clicked (highlight button)
- One feedback per question per user
- Disable buttons after selection

## Acceptance Criteria
- [ ] Feedback buttons implemented
- [ ] 5-second window enforced
- [ ] Feedback stored correctly
- [ ] Question stats updated
- [ ] One feedback per user per question
- [ ] Poor questions flagged for review
- [ ] Feedback visible in admin dashboard

## Labels
feature, frontend, backend, priority-medium

## Documentation
[User Feedback Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#8-user-feedback-användarfeedback)
"@

Write-Host "  └─ Feature: Batch Validation Trigger" -ForegroundColor Blue
gh issue create --title "Batch Validation Trigger" --body @"
## Description
Implement system to trigger batch validation when enough reports or negative feedback accumulates.

**Part of:** [EPIC] User Interaction Features

## Trigger Conditions
Batch validation triggers when:
1. **3+ reports** on same question
2. **5+ similar questions** reported in category
3. **Feedback ratio <0.3** with 20+ votes
4. **Admin manually triggers** batch validation

## Batch Validation Process
1. Identify similar questions (same category, age group, topic)
2. Select 10-50 questions for re-validation
3. Run AI validation on all questions
4. Compare results with original validation
5. Flag questions with changed results
6. Generate batch report for admin

## Similarity Criteria
Questions are "similar" if they share:
- Same primary category
- Same age group
- Same AI provider (generator)
- Created within 30 days of each other

## Batch Size Logic
- **Low priority**: 10 questions
- **Medium priority**: 25 questions
- **High priority**: 50 questions

Priority based on:
- Number of reports (more = higher)
- Feedback ratio (lower = higher)
- Question visibility (more views = higher)

## Acceptance Criteria
- [ ] Batch validation triggers on conditions
- [ ] Similar questions identified correctly
- [ ] Batch size calculated by priority
- [ ] All questions re-validated
- [ ] Results compared with original
- [ ] Batch report generated
- [ ] Admin notified of results

## Labels
feature, backend, ai, priority-medium

## Documentation
[Batch Validation Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#77-batch-validation-batchvalidering)
"@

# ==========================================
# MILESTONE 3: AUTOMATED QUALITY SYSTEMS
# ==========================================
Write-Host "`n📋 MILESTONE 3: Automated Quality Systems" -ForegroundColor Magenta

Write-Host "`n🔹 EPIC: Automated Quality Control" -ForegroundColor Cyan
gh issue create --title "[EPIC] Automated Quality Control" --body @"
## Epic Overview
Implement automated background processes that continuously improve question quality through difficulty calibration, seasonal updates, auto-approval, and monthly generation.

## Sub-tasks
- [ ] Difficulty Calibration System
- [ ] Seasonal Update System
- [ ] Auto-Approval System
- [ ] Monthly Question Generation

## Acceptance Criteria
- ✅ Nightly difficulty calibration (03:00)
- ✅ Weekly seasonal checks (Mondays 02:00)
- ✅ Monthly auto-generation (first Monday)
- ✅ Auto-approval for high-confidence questions
- ✅ All processes logged and monitorable

## Labels
epic, backend, ai, priority-high

## Milestone
Milestone 3: Automated Quality Systems

## Documentation
[AI_QUESTION_GENERATION.md - Automated Systems](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

Write-Host "  ├─ Feature: Difficulty Calibration" -ForegroundColor Blue
gh issue create --title "Difficulty Calibration System" --body @"
## Description
Implement nightly automated process to calibrate question difficulty based on player success rates.

**Part of:** [EPIC] Automated Quality Control

## Calibration Schedule
- **Runs**: Every night at **03:00** (Swedish time)
- **Processes**: Questions with 50+ views
- **Auto-adjusts**: Questions with 100+ views

## Success Rate Formula
'''
success_rate = times_correct / times_shown
'''

## Difficulty Levels
- **Easy**: success_rate > 0.7
- **Medium**: 0.3 ≤ success_rate ≤ 0.7
- **Hard**: success_rate < 0.3

## Auto-Adjustment (100+ views)
- Current: Easy → New: Medium (if success_rate drops to 0.6)
- Current: Hard → New: Medium (if success_rate rises to 0.4)
- Update 'difficulty_level' and 'last_calibrated_at'

## Calibration Report
Generate daily report:
- Total questions calibrated
- Questions auto-adjusted
- New difficulty distribution
- Questions needing review (very low/high success rates)

## Acceptance Criteria
- [ ] Nightly cron job at 03:00
- [ ] Success rate calculated correctly
- [ ] Difficulty levels assigned
- [ ] Auto-adjustment at 100+ views
- [ ] Questions with 50-99 views flagged
- [ ] Daily report generated
- [ ] Admin dashboard shows calibration stats

## Labels
feature, backend, priority-high

## Documentation
[Difficulty Calibration Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#9-difficulty-calibration-svårighetsgraduering)
"@

Write-Host "  ├─ Feature: Seasonal Update System" -ForegroundColor Blue
gh issue create --title "Seasonal Update System" --body @"
## Description
Implement automated system to identify and update outdated Youth questions (>6 months old) to keep content fresh and relevant.

**Part of:** [EPIC] Automated Quality Control

## Update Schedule
- **Weekly check**: Every Monday at **02:00**
- **Monthly generation**: First Monday of each month at **02:00**

## Seasonal Threshold
- **Youth questions**: >183 days (6 months) = outdated
- **Children/Adults**: No automatic seasonal updates (Swedish focus, more timeless)

## Weekly Check Process
1. Find Youth questions created >183 days ago
2. Filter by categories prone to change:
   - "Social Media", "Pop kultur", "Kändisar", "Teknik", "Gaming"
3. Check if still relevant (simple date check)
4. Flag outdated questions for review

## Monthly Generation Process
1. Identify top 10 outdated topics from flagged questions
2. Generate 20-30 new Youth questions for those topics
3. Mark old questions as 'outdated = true'
4. Run validation on new questions
5. Auto-approve if confidence ≥90%

## Outdated Question Handling
- Set 'outdated = true'
- Reduce visibility (show less often)
- Don't delete (keep for duplicate checking)
- Can be manually re-activated if still relevant

## Acceptance Criteria
- [ ] Weekly cron job at Monday 02:00
- [ ] 6-month threshold checked (183 days)
- [ ] Only Youth questions flagged
- [ ] Categories filtered correctly
- [ ] Monthly generation on first Monday
- [ ] Old questions marked outdated
- [ ] New questions auto-generated
- [ ] Report sent to admin

## Labels
feature, backend, ai, priority-medium

## Documentation
[Seasonal Updates Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#10-seasonal-updates-säsongsuppdateringar)
"@

Write-Host "  ├─ Feature: Auto-Approval System" -ForegroundColor Blue
gh issue create --title "Auto-Approval System" --body @"
## Description
Implement automatic approval for high-confidence questions that pass all validation checks.

**Part of:** [EPIC] Automated Quality Control

## Auto-Approval Criteria
Question is auto-approved if ALL conditions met:

### 1. High Confidence (≥90%)
- AI validation score ≥90%
- After enighet bonus applied

### 2. Passes All Checks
- ✅ Content filter passed
- ✅ No duplicate detected (similarity <70%)
- ✅ All required fields present
- ✅ Both languages complete

### 3. Not Blocked
- ❌ Status not "quarantined" or "reported"
- ❌ Not flagged by content filter
- ❌ No pending reports

## Auto-Approval Actions
1. Set 'status = "approved"'
2. Set 'auto_approved = true'
3. Set 'approved_at = NOW()'
4. Make visible to players immediately
5. Log approval in audit trail

## Manual Override Priority
- Manual approval/rejection ALWAYS overrides auto-approval
- Set 'manually_reviewed = true' to prevent future auto-approval

## Monitoring
Track auto-approval stats:
- Auto-approval rate (% of generated questions)
- False positive rate (auto-approved but later reported)
- Admin override rate (manual rejection of auto-approved)

## Acceptance Criteria
- [ ] Auto-approval triggers on criteria
- [ ] All checks validated before approval
- [ ] Blocked statuses prevent auto-approval
- [ ] Approval logged in database
- [ ] Manual override works correctly
- [ ] Stats tracked in dashboard
- [ ] Audit trail maintained

## Labels
feature, backend, priority-high

## Documentation
[Auto-Approval Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#auto-godkännande)
"@

Write-Host "  └─ Feature: Monthly Question Generation" -ForegroundColor Blue
gh issue create --title "Monthly Question Generation" --body @"
## Description
Implement automated monthly generation of new questions to keep content fresh, triggered on the first Monday of each month.

**Part of:** [EPIC] Automated Quality Control

## Generation Schedule
- **When**: First Monday of each month at **02:00**
- **Triggered by**: Seasonal update system

## Generation Strategy
1. **Analyze trends**: Check which categories need more questions
2. **Topic selection**: Identify top 10 trending topics
3. **Age group balance**: Ensure even distribution across age groups
4. **Provider rotation**: Rotate through AI providers for diversity

## Monthly Quota
- **Youth**: 30 questions (global focus, trending topics)
- **Children**: 20 questions (Swedish focus, educational)
- **Adults**: 20 questions (Swedish focus, mixed topics)
- **Total**: ~70 new questions per month

## Quality Checks
All generated questions go through:
1. AI-to-AI validation
2. Confidence scoring
3. Content filtering
4. Duplicate detection
5. Auto-approval (if ≥90% confidence)

## Topic Sources
Identify trending topics from:
- Recent popular questions (high views)
- User feedback (high positive feedback)
- Seasonal events (holidays, sports, etc.)
- Category gaps (underrepresented topics)

## Report Generation
Monthly report includes:
- Total questions generated
- Breakdown by age group and category
- Auto-approval rate
- Questions needing review
- Topic distribution

## Acceptance Criteria
- [ ] Cron job on first Monday 02:00
- [ ] Trend analysis identifies topics
- [ ] 70 questions generated monthly
- [ ] Age group distribution balanced
- [ ] Provider rotation implemented
- [ ] All quality checks performed
- [ ] Monthly report generated
- [ ] Admin notified of completion

## Labels
feature, backend, ai, priority-medium

## Documentation
[Seasonal Updates Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#10-seasonal-updates-säsongsuppdateringar)
"@

# ==========================================
# MILESTONE 4: ADVANCED FEATURES
# ==========================================
Write-Host "`n📋 MILESTONE 4: Advanced Features" -ForegroundColor Magenta

Write-Host "`n🔹 EPIC: Advanced Features & Enhancements" -ForegroundColor Cyan
gh issue create --title "[EPIC] Advanced Features & Enhancements" --body @"
## Epic Overview
Implement advanced features that enhance user experience and administrative capabilities, including category preferences, AI illustrations, soft delete system, and admin dashboard improvements.

## Sub-tasks
- [ ] Category Preference System
- [ ] AI Illustration Generation
- [ ] Soft Delete System
- [ ] Admin Dashboard Enhancements

## Acceptance Criteria
- ✅ Players can filter questions by category
- ✅ Questions have AI-generated illustrations
- ✅ Deleted questions kept for duplicate checking
- ✅ Admin dashboard shows comprehensive stats
- ✅ All features well-documented

## Labels
epic, frontend, backend, priority-medium

## Milestone
Milestone 4: Advanced Features

## Documentation
[AI_QUESTION_GENERATION.md](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

Write-Host "  ├─ Feature: Category Preference System" -ForegroundColor Blue
gh issue create --title "Category Preference System" --body @"
## Description
Allow players to select preferred question categories to personalize their quiz experience.

**Part of:** [EPIC] Advanced Features & Enhancements

## User Flow
1. **First quiz**: All categories enabled (default)
2. **After first quiz**: Popup asking "Vill du välja kategorier?"
3. **Category selection**: Show all 30+ categories with checkboxes
4. **Save preferences**: Store in user profile or localStorage
5. **Future quizzes**: Only show questions from selected categories

## Category Groups
Display categories in groups:
- **Huvudkategorier** (15 categories)
- **Sociala medier** (8 categories)
- **Pop kultur** (10 categories)

## Preference Storage
- **Logged in users**: Store in 'user_preferences' table
- **Anonymous users**: Store in localStorage
- Format: '["Historia", "Geografi", "Musik", "Gaming"]'

## Question Filtering
When generating quiz:
1. Get user's selected categories
2. Filter question pool by categories
3. Ensure enough questions available (min 50 per category)
4. If <50, show warning and suggest more categories

## Settings Management
- **View**: Show current preferences
- **Edit**: Change category selection anytime
- **Reset**: Back to all categories
- Accessible from profile/settings menu

## Acceptance Criteria
- [ ] Popup shows after first quiz
- [ ] All categories selectable
- [ ] Preferences saved correctly
- [ ] Questions filtered by preferences
- [ ] Minimum questions check (50)
- [ ] Settings UI implemented
- [ ] Works for logged in + anonymous users

## Labels
feature, frontend, backend, priority-medium

## Documentation
[Category Filters Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#11-category-filters-kategorifilter)
"@

Write-Host "  ├─ Feature: AI Illustration Generation" -ForegroundColor Blue
gh issue create --title "AI Illustration Generation" --body @"
## Description
Generate AI illustrations for questions to make them more engaging and visually appealing.

**Part of:** [EPIC] Advanced Features & Enhancements

## Illustration Providers
- **DALL-E 3** (default, OpenAI)
- **Midjourney** (via API)
- **Stable Diffusion** (self-hosted option)

## Generation Timing
- **When**: After question validation passes
- **Process**: Background task (5-15 seconds per question)
- **Progress**: Shows in task progress (85% → 100%)

## Prompt Generation
Auto-generate illustration prompts based on:
- Question topic and category
- Age group (style appropriateness)
- Target audience (cultural context)

**Example prompts**:
- Children: "Colorful, friendly cartoon style illustration of [topic]"
- Youth: "Modern, vibrant digital art of [topic]"
- Adults: "Realistic, professional illustration of [topic]"

## Age-Appropriate Styles
- **Children (6-12)**: Cartoon, colorful, friendly, educational
- **Youth (13-25)**: Modern, trendy, digital art, pop culture
- **Adults (25+)**: Realistic, professional, classical

## Fallback Handling
If illustration generation fails:
- Use category-specific placeholder image
- Store 'illustration_url = null'
- Don't block question approval
- Can retry generation later

## Image Storage
- Store in Cloudflare R2 bucket
- CDN delivery for fast loading
- Compress images (WebP format)
- Multiple sizes (thumbnail, full)

## Acceptance Criteria
- [ ] DALL-E 3 integration working
- [ ] Prompts auto-generated correctly
- [ ] Age-appropriate styles applied
- [ ] Images stored in R2
- [ ] Placeholder fallback works
- [ ] Retry mechanism for failures
- [ ] Images display in questions
- [ ] Generation time tracked

## Labels
feature, backend, ai, priority-low

## Documentation
[AI Illustrations Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#12-ai-illustrations-ai-illustrationer)
"@

Write-Host "  ├─ Feature: Soft Delete System" -ForegroundColor Blue
gh issue create --title "Soft Delete System" --body @"
## Description
Implement soft delete system that marks questions as deleted but keeps them in database for duplicate checking and potential restoration.

**Part of:** [EPIC] Advanced Features & Enhancements

## Soft Delete Behavior
- **Mark deleted**: Set 'deleted_at = NOW()'
- **Keep in database**: Never auto-cleanup
- **Used for duplicates**: Still checked in duplicate detection
- **Hidden from players**: Not shown in quiz questions
- **Restorable**: Can be un-deleted by admin

## Deletion Triggers
Questions can be soft-deleted by:
1. **Admin manual deletion**
2. **Auto-rejection** (very low confidence)
3. **Multiple reports** (10+ reports)
4. **Content filter** (severe violations)
5. **Outdated** (replaced by newer version)

## Hard Delete (Rare)
Hard delete ONLY for:
- **Sensitive content** (privacy violations, illegal content)
- **Legal requirements** (GDPR data deletion requests)
- **Admin special permission** required
- **Warning shown** before hard delete

## Restoration Process
Admin can restore deleted questions:
1. View deleted questions in admin panel
2. Review deletion reason
3. Click "Restore" button
4. Set 'deleted_at = NULL'
5. Set 'status = "needs_review"'
6. Re-validate before showing to players

## Database Query Handling
All queries must filter deleted questions:
'''sql
WHERE deleted_at IS NULL
'''

**Except** duplicate checking:
'''sql
-- Include deleted questions for duplicate checking
WHERE 1=1  -- no deleted_at filter
'''

## Acceptance Criteria
- [ ] Soft delete marks 'deleted_at'
- [ ] Deleted questions hidden from players
- [ ] Duplicate checking includes deleted
- [ ] Restoration functionality works
- [ ] Hard delete requires special permission
- [ ] Warning shown for hard delete
- [ ] Admin panel shows deleted questions
- [ ] All queries filter correctly

## Labels
feature, backend, database, priority-medium

## Documentation
[Soft Delete Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md#soft-delete-mjuk-radering)
"@

Write-Host "  └─ Feature: Admin Dashboard Enhancements" -ForegroundColor Blue
gh issue create --title "Admin Dashboard Enhancements" --body @"
## Description
Enhance admin dashboard with comprehensive statistics, charts, and monitoring tools for the AI question system.

**Part of:** [EPIC] Advanced Features & Enhancements

## Dashboard Sections

### 1. Overview Stats
- Total questions (by status)
- Auto-approval rate
- Average confidence score
- Questions needing review
- Monthly generation stats

### 2. Quality Metrics
- **Validation**: AI validation pass rate
- **Confidence**: Distribution (0-69%, 70-89%, 90-100%)
- **Duplicates**: Duplicate detection rate
- **Reports**: Questions reported, quarantined

### 3. User Engagement
- **Feedback**: Positive/negative ratio
- **Reports**: Top reported categories
- **Difficulty**: Success rate by difficulty level
- **Popular**: Most viewed questions

### 4. AI Provider Stats
- Questions generated per provider
- Validation success rate per provider
- Average confidence per provider
- Cost tracking (API usage)

### 5. Automated Systems
- **Calibration**: Last run, questions calibrated
- **Seasonal**: Last check, questions flagged
- **Monthly gen**: Last run, questions created
- **Batch validation**: Active batches, results

### 6. Charts & Visualizations
- 📊 Question generation over time (line chart)
- 📊 Confidence distribution (histogram)
- 📊 Category distribution (pie chart)
- 📊 Provider performance (bar chart)
- 📊 User feedback trends (line chart)

## Real-Time Updates
- Live stats refresh every 30 seconds
- Background task progress monitoring
- Alert notifications (reports, failures)

## Export Functionality
- Export stats to CSV
- Generate monthly reports (PDF)
- Download question datasets

## Acceptance Criteria
- [ ] All overview stats implemented
- [ ] Quality metrics calculated correctly
- [ ] User engagement stats tracked
- [ ] Provider stats shown
- [ ] Automated systems monitoring
- [ ] Charts and visualizations working
- [ ] Real-time updates functional
- [ ] Export functionality working
- [ ] Responsive design for mobile

## Labels
feature, frontend, backend, priority-low

## Documentation
[Admin Dashboard Section](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

Write-Host "`n✅ All Milestone 2-4 Issues Created!" -ForegroundColor Green
Write-Host "`nTotal issues created:" -ForegroundColor Yellow
Write-Host "  • Milestone 2: 4 issues (1 Epic + 3 Features)" -ForegroundColor Cyan
Write-Host "  • Milestone 3: 5 issues (1 Epic + 4 Features)" -ForegroundColor Cyan
Write-Host "  • Milestone 4: 5 issues (1 Epic + 4 Features)" -ForegroundColor Cyan
Write-Host "  • Grand Total: 14 new issues" -ForegroundColor Cyan
Write-Host "`nView all issues: gh issue list --limit 30" -ForegroundColor White
Write-Host "Or visit: https://github.com/tobbelta/Quizter/issues`n" -ForegroundColor White

