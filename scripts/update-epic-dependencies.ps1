# Update Epic issues with proper task ordering and dependencies
# Run this from the repository root: .\scripts\update-epic-dependencies.ps1

Write-Host "`n=== Updating Epic Issues with Dependencies ===" -ForegroundColor Cyan

# Epic #67: Core Question Generation System
Write-Host "`nUpdating Epic #67: Core Question Generation System..." -ForegroundColor Magenta
gh issue edit 67 --body @"
## Epic Overview
Implement the fundamental question generation system with AI provider integration, dual-language support, and proper classification.

## Work Phases & Dependencies

### 🔹 Phase 1: Foundation (Start Here)
Must be completed first - these are prerequisites for everything else.

- [ ] **#68 - AI Provider Integration** ⚡ CRITICAL - Start here!
  - Integrate OpenAI, Gemini, Anthropic, Mistral
  - Random provider selection
  - API key management in Cloudflare Secrets
  - **Blocks**: All other tasks (nothing works without this)
  
- [ ] **#71 - Age Group & Category Classification** ⚡ CRITICAL
  - Database schema for questions table
  - Age group validation (children, youth, adults)
  - Category validation (30+ categories)
  - **Blocks**: #69, #70 (API needs schema)

### 🔹 Phase 2: Core Generation
Can start when Phase 1 is complete.

- [ ] **#69 - Question Generation API with Background Tasks** ⚡ CRITICAL
  - POST /api/generateAIQuestions endpoint
  - Background task system (SSE)
  - Progress tracking (6 phases)
  - **Depends on**: #68 (providers), #71 (schema)
  - **Blocks**: #70, #73 (validation needs generated questions)
  
- [ ] **#70 - Dual-language Support (Swedish + English)** ⚡ CRITICAL
  - Enforce both languages in all questions
  - Target audience logic (swedish/global)
  - Translation validation
  - **Depends on**: #69 (integrates into generation API)
  - **Can work parallel with**: #73-76 (validation systems)

## Acceptance Criteria
- ✅ All 4 AI providers integrated (OpenAI, Gemini, Anthropic, Mistral)
- ✅ API endpoint generates questions with progress tracking
- ✅ ALL questions have both Swedish and English versions
- ✅ Questions properly classified by age group and categories

## Timeline Estimate
- Phase 1 (Foundation): **2-3 weeks**
- Phase 2 (Core Generation): **2-3 weeks**
- **Total**: 4-6 weeks

## Documentation
[AI_QUESTION_GENERATION.md](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

# Epic #72: Validation & Quality Control
Write-Host "Updating Epic #72: Validation & Quality Control..." -ForegroundColor Magenta
gh issue edit 72 --body @"
## Epic Overview
Implement comprehensive validation system with AI-to-AI validation, confidence scoring, content filtering, duplicate detection, and manual review.

## Work Phases & Dependencies

### 🔹 Phase 3: Validation System
Can start when Phase 2 (#69, #70) is in progress or complete.

- [ ] **#73 - AI-to-AI Validation System** ⚡ CRITICAL
  - Cross-provider validation
  - Enighet bonus (agreement +20%, disagreement -20%)
  - Validation by provider count (2→1, 3→2, 4→3)
  - **Depends on**: #68 (providers), #69 (generated questions)
  - **Can work parallel with**: #74, #75, #76
  
- [ ] **#74 - Confidence Score Calculation (0-100%)** ⚡ CRITICAL
  - Confidence formula implementation
  - Thresholds (90%+ auto-approve, 70-89% show, <70% review)
  - Auto-approval logic with blockers
  - **Depends on**: #73 (AI validation), #75 (content filter), #76 (duplicates)
  - **Blocks**: #77 (admin needs confidence scores)
  
- [ ] **#75 - Content Filtering System** 🔴 HIGH PRIORITY
  - Keyword filtering (Swedish + English)
  - AI content analysis
  - Auto-quarantine for violations
  - **Depends on**: #68 (AI providers for analysis)
  - **Can work parallel with**: #73, #76
  
- [ ] **#76 - Semantic Duplicate Detection** 🔴 HIGH PRIORITY
  - Semantic similarity calculation
  - Thresholds (70%+ duplicate, 50-69% flag, <50% unique)
  - Soft-delete integration
  - **Depends on**: #71 (database schema)
  - **Can work parallel with**: #73, #75

### 🔹 Phase 4: Admin Interface
Can start when Phase 3 validation is working.

- [ ] **#77 - Manual Review System (Admin UI)** 🔴 HIGH PRIORITY
  - Admin review queue (priority sorted)
  - Approve/Edit/Reject/Quarantine actions
  - Manual override (highest priority)
  - Bulk actions
  - **Depends on**: #74 (needs confidence scores), #76 (duplicate flags)
  - **Recommended**: Start after validation is stable

## Acceptance Criteria
- ✅ Multi-provider validation working
- ✅ Confidence scores calculated correctly (0-100%)
- ✅ Content filtering catches inappropriate content
- ✅ Duplicate detection prevents redundant questions
- ✅ Manual review can override AI decisions

## Timeline Estimate
- Phase 3 (Validation): **3-4 weeks** (parallel work possible)
- Phase 4 (Admin UI): **2 weeks**
- **Total**: 5-6 weeks (overlaps with Phase 2)

## Documentation
[AI_QUESTION_GENERATION.md](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

# Epic #78: User Interaction Features
Write-Host "Updating Epic #78: User Interaction Features..." -ForegroundColor Magenta
gh issue edit 78 --body @"
## Epic Overview
Implement user-facing features that allow players to report problematic questions, provide feedback, and trigger quality improvements through batch validation.

## Work Phases & Dependencies

### 🔹 Phase 5: User Features (Milestone 2)
Can start when Milestone 1 Phase 3 is complete (validation working).

- [ ] **#79 - Question Reporting System** 🔴 HIGH PRIORITY
  - Report button in question view
  - Reason selection (4 options)
  - Auto-quarantine on report
  - Report threshold triggers (3, 5, 10 reports)
  - **Depends on**: M1 complete (need questions to report)
  - **Can work parallel with**: #80
  
- [ ] **#80 - User Feedback System (👍👎)** 🟡 MEDIUM PRIORITY
  - Thumbs up/down buttons
  - 5-second feedback window
  - Feedback ratio tracking
  - Poor question flagging (<0.3 ratio)
  - **Depends on**: M1 complete
  - **Can work parallel with**: #79, #81
  
- [ ] **#81 - Batch Validation Trigger** 🟡 MEDIUM PRIORITY
  - Trigger conditions (reports, feedback)
  - Similar question identification
  - Batch size logic (10-50 questions)
  - Batch report generation
  - **Depends on**: #73 (validation system), #79 (reports), #80 (feedback)

## Acceptance Criteria
- ✅ Players can report questions with reasons
- ✅ Reported questions automatically quarantined
- ✅ Players can give thumbs up/down feedback
- ✅ Feedback tracked and stored
- ✅ Batch validation triggered by report threshold

## Timeline Estimate
- **Total**: 2-3 weeks (can work in parallel)

## Documentation
[AI_QUESTION_GENERATION.md - User Features](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

# Epic #82: Automated Quality Control
Write-Host "Updating Epic #82: Automated Quality Control..." -ForegroundColor Magenta
gh issue edit 82 --body @"
## Epic Overview
Implement automated background processes that continuously improve question quality through difficulty calibration, seasonal updates, auto-approval, and monthly generation.

## Work Phases & Dependencies

### 🔹 Phase 6: Automation (Milestone 3)
Can start after Milestone 1 is stable and M2 user features are working.

- [ ] **#83 - Difficulty Calibration System** 🔴 HIGH PRIORITY
  - Nightly cron job (03:00)
  - Success rate calculation
  - Difficulty levels (Easy/Medium/Hard)
  - Auto-adjustment at 100+ views
  - **Depends on**: M1 complete (need question stats)
  - **Can work parallel with**: #84, #85
  
- [ ] **#84 - Seasonal Update System** 🟡 MEDIUM PRIORITY
  - Weekly check (Mondays 02:00)
  - 6-month threshold (183 days)
  - Monthly generation (first Monday)
  - Outdated question flagging
  - **Depends on**: #69 (generation API), #73 (validation)
  - **Can work parallel with**: #83, #86
  
- [ ] **#85 - Auto-Approval System** 🔴 HIGH PRIORITY
  - Auto-approve criteria (≥90% confidence)
  - All checks validation
  - Blocked status handling
  - Manual override priority
  - **Depends on**: #74 (confidence system)
  - **Can work parallel with**: #83, #84
  
- [ ] **#86 - Monthly Question Generation** 🟡 MEDIUM PRIORITY
  - First Monday of month (02:00)
  - Trend analysis
  - 70 questions/month (30 Youth, 20 Children, 20 Adults)
  - Provider rotation
  - **Depends on**: #84 (seasonal system), #85 (auto-approval)

## Acceptance Criteria
- ✅ Nightly difficulty calibration (03:00)
- ✅ Weekly seasonal checks (Mondays 02:00)
- ✅ Monthly auto-generation (first Monday)
- ✅ Auto-approval for high-confidence questions
- ✅ All processes logged and monitorable

## Timeline Estimate
- **Total**: 3-4 weeks (many can work in parallel)

## Documentation
[AI_QUESTION_GENERATION.md - Automation](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

# Epic #87: Advanced Features & Enhancements
Write-Host "Updating Epic #87: Advanced Features & Enhancements..." -ForegroundColor Magenta
gh issue edit 87 --body @"
## Epic Overview
Implement advanced features that enhance user experience and administrative capabilities, including category preferences, AI illustrations, soft delete system, and admin dashboard improvements.

## Work Phases & Dependencies

### 🔹 Phase 7: Advanced Features (Milestone 4)
Can start anytime - these are enhancements, not blockers.

- [ ] **#88 - Category Preference System** 🟡 MEDIUM PRIORITY
  - Category selection popup (after first quiz)
  - Preference storage (user table + localStorage)
  - Question filtering by preferences
  - Minimum questions check (50)
  - **Depends on**: M1 complete (need questions)
  - **Can work parallel with**: All M4 features
  
- [ ] **#89 - AI Illustration Generation** 🟢 LOW PRIORITY
  - DALL-E 3 integration
  - Auto-prompt generation
  - Age-appropriate styles
  - Placeholder fallback
  - **Depends on**: #68 (OpenAI provider)
  - **Can work parallel with**: All M4 features
  - **Nice to have**: Not blocking anything
  
- [ ] **#90 - Soft Delete System** 🟡 MEDIUM PRIORITY
  - Soft delete (mark deleted_at)
  - Keep for duplicate checking
  - Restoration functionality
  - Hard delete warnings
  - **Depends on**: #71 (database schema), #76 (duplicate detection)
  - **Can work parallel with**: #88, #91
  
- [ ] **#91 - Admin Dashboard Enhancements** 🟢 LOW PRIORITY
  - Overview stats
  - Quality metrics
  - User engagement stats
  - Charts and visualizations
  - Export functionality
  - **Depends on**: M1-M3 complete (need data)
  - **Can work independently**

## Acceptance Criteria
- ✅ Players can filter questions by category
- ✅ Questions have AI-generated illustrations
- ✅ Deleted questions kept for duplicate checking
- ✅ Admin dashboard shows comprehensive stats
- ✅ All features well-documented

## Timeline Estimate
- **Total**: 2-3 weeks (low priority, can be done last)

## Documentation
[AI_QUESTION_GENERATION.md](https://github.com/tobbelta/Quizter/blob/feature/rebuild-ai-backend/docs/AI_QUESTION_GENERATION.md)
"@

Write-Host "`n✅ All Epic issues updated with dependencies!" -ForegroundColor Green
Write-Host "`nWork Order Summary:" -ForegroundColor Yellow
Write-Host "  Phase 1 (Foundation):    #68, #71 → Start here!" -ForegroundColor Cyan
Write-Host "  Phase 2 (Core):          #69, #70 → Depends on Phase 1" -ForegroundColor Cyan
Write-Host "  Phase 3 (Validation):    #73-76  → Can parallel with Phase 2" -ForegroundColor Cyan
Write-Host "  Phase 4 (Admin):         #77     → After validation works" -ForegroundColor Cyan
Write-Host "  Phase 5 (User Features): #79-81  → Milestone 2" -ForegroundColor Cyan
Write-Host "  Phase 6 (Automation):    #83-86  → Milestone 3" -ForegroundColor Cyan
Write-Host "  Phase 7 (Advanced):      #88-91  → Milestone 4 (low priority)" -ForegroundColor Cyan
Write-Host "`nView Epic issues:" -ForegroundColor White
Write-Host "  gh issue view 67  # Epic 1: Core Generation" -ForegroundColor Gray
Write-Host "  gh issue view 72  # Epic 2: Validation" -ForegroundColor Gray
Write-Host "  gh issue view 78  # Epic 3: User Features" -ForegroundColor Gray
Write-Host "  gh issue view 82  # Epic 4: Automation" -ForegroundColor Gray
Write-Host "  gh issue view 87  # Epic 5: Advanced" -ForegroundColor Gray
