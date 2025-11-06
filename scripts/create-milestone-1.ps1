# Create GitHub Issues for Milestone 1: MVP - Basic Question Generation
# Run this from the repository root: .\scripts\create-milestone-1.ps1

Write-Host "`n=== Creating GitHub Issues for Milestone 1 ===" -ForegroundColor Cyan
Write-Host "Repository: tobbelta/Quizter" -ForegroundColor Yellow
Write-Host "Branch: feature/rebuild-ai-backend`n" -ForegroundColor Yellow

# Check authentication
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Authenticated`n" -ForegroundColor Green

# Note: Milestones must be created via GitHub web UI
# https://github.com/tobbelta/Quizter/milestones/new
Write-Host "Note: Create Milestone manually via GitHub web UI if needed" -ForegroundColor Yellow

# Epic #1: Core Question Generation System
Write-Host "`nCreating Epic #1: Core Question Generation System..." -ForegroundColor Magenta
$epic1 = gh issue create --title "[EPIC] Core Question Generation System" --body @"
## Epic Overview
Implement the fundamental question generation system with AI provider integration, dual-language support, and proper classification.

## Sub-tasks
- [ ] #ISSUE_AI_PROVIDER AI Provider Integration
- [ ] #ISSUE_GENERATION_API Question Generation API with Background Tasks
- [ ] #ISSUE_DUAL_LANGUAGE Dual-language Support (Swedish + English)
- [ ] #ISSUE_CLASSIFICATION Age Group & Category Classification

## Acceptance Criteria
- All 4 AI providers integrated (OpenAI, Gemini, Anthropic, Mistral)
- API endpoint generates questions with progress tracking
- ALL questions have both Swedish and English versions
- Questions properly classified by age group and categories

## Documentation
See: [AI_QUESTION_GENERATION.md](../docs/AI_QUESTION_GENERATION.md)

## Milestone
Milestone 1: MVP - Basic Question Generation
"@

Write-Host "✓ Epic #1 created" -ForegroundColor Green

# Feature #1.1: AI Provider Integration
Write-Host "Creating Feature: AI Provider Integration..." -ForegroundColor Blue
gh issue create --title "AI Provider Integration" --body @"
## Description
Integrate 4 AI providers for question generation with support for random provider selection.

## Providers to Integrate
1. **OpenAI** (gpt-4o-mini)
2. **Gemini** (gemini-1.5-flash)
3. **Anthropic** (claude-3.5-sonnet)
4. **Mistral** (mistral-small-latest)

## Technical Details
- Store API keys in Cloudflare Secrets (OPENAI_API_KEY, GEMINI_API_KEY, etc.)
- Create service layer for each provider (functions/services/)
- Implement random provider selection (equal probability when "random" selected)
- Handle provider-specific response formats
- Implement retry logic for failed API calls

## Acceptance Criteria
- [ ] All 4 providers can generate questions
- [ ] Random provider selection works correctly
- [ ] API keys stored securely in Cloudflare Secrets
- [ ] Error handling for API failures
- [ ] Provider-specific response parsing

## Related Epic
Part of: [EPIC] Core Question Generation System

## Documentation
See: [AI_QUESTION_GENERATION.md - AI Providers](../docs/AI_QUESTION_GENERATION.md#2-ai-providers-ai-leverantörer)
"@ --label "feature,backend,priority-critical"

# Feature #1.2: Question Generation API
Write-Host "Creating Feature: Question Generation API..." -ForegroundColor Blue
gh issue create --title "Question Generation API with Background Tasks" --body @"
## Description
Create API endpoint for generating AI questions with background task processing and real-time progress updates.

## API Endpoint
\`\`\`
POST /api/generateAIQuestions
Body: {
  count: 10,
  age_group: "youth",
  provider: "random",
  categories: ["Pop kultur", "Musik"]
}
Response: {
  taskId: "task_abc123",
  status: "processing"
}
\`\`\`

## Technical Details
- Implement background task system using Server-Sent Events (SSE)
- Return taskId immediately, process in background
- Track progress through 6 phases: 10% → 30% → 50% → 70% → 85% → 100%
- Store task status in D1 database
- Support GET /api/task-status/:taskId for progress polling

## Progress Phases
1. **10%** - Preparing (validate input, initialize)
2. **30%** - Generating (calling AI provider)
3. **50%** - Validating (AI validation)
4. **70%** - Saving (storing in database)
5. **85%** - Creating illustrations (DALL-E)
6. **100%** - Complete

## Acceptance Criteria
- [ ] POST endpoint accepts parameters correctly
- [ ] Background task system implemented
- [ ] Progress tracking works through all 6 phases
- [ ] taskId can be used to check status
- [ ] Error handling for failed tasks
- [ ] Task cleanup after completion

## Related Epic
Part of: [EPIC] Core Question Generation System

## Documentation
See: [AI_QUESTION_GENERATION.md - Question Generation](../docs/AI_QUESTION_GENERATION.md#6-question-generation-frågegenerering)
"@ --label "feature,backend,priority-critical"

# Feature #1.3: Dual-language Support
Write-Host "Creating Feature: Dual-language Support..." -ForegroundColor Blue
gh issue create --title "Dual-language Support (Swedish + English)" --body @"
## Description
Ensure ALL generated questions have both Swedish and English versions, with proper target audience handling.

## Requirements
- **MANDATORY**: Every question MUST have both \`question_text_swedish\` and \`question_text_english\`
- Same for answers: both \`correct_answer_swedish\` and \`correct_answer_english\`
- \`target_audience\`: "swedish" or "global"

## Target Audience Rules
- **Children (6-12)**: Always "swedish" (overrides Youth global focus)
- **Youth (13-25)**: "global" by default (can be "swedish" if locally relevant)
- **Adults (25+)**: Always "swedish" (overrides Youth global focus)

## Priority Logic
If question has multiple age groups:
- Children OR Adults present → \`target_audience = "swedish"\`
- Only Youth → \`target_audience = "global"\`

## Validation
- Reject questions missing either language
- Verify translations are equivalent in meaning
- Check that target_audience matches age group rules

## Acceptance Criteria
- [ ] All generated questions have Swedish + English
- [ ] Target audience correctly assigned based on age groups
- [ ] Validation rejects incomplete translations
- [ ] Database schema enforces dual-language
- [ ] API response includes both languages

## Related Epic
Part of: [EPIC] Core Question Generation System

## Documentation
See: [AI_QUESTION_GENERATION.md - Dual-language](../docs/AI_QUESTION_GENERATION.md#tvåspråkighet-dual-language)
"@ --label "feature,backend,frontend,priority-critical"

# Feature #1.4: Age Group & Category Classification
Write-Host "Creating Feature: Age Group & Category Classification..." -ForegroundColor Blue
gh issue create --title "Age Group & Category Classification" --body @"
## Description
Implement automatic classification of questions by age groups and categories with validation rules.

## Age Groups
- **children**: 6-12 years (Swedish focus)
- **youth**: 13-25 years (global focus)
- **adults**: 25+ years (Swedish focus)

## Categories (30+ total)
**Main Categories**: Historia, Geografi, Vetenskap, Kultur, Sport, etc.
**Social Media**: Instagram, TikTok, YouTube, Snapchat, etc.
**Pop Culture**: Film, TV-serier, Musik, Gaming, etc.

## Format Rules
- Multiple age groups: \`"children,youth"\` (NO SPACES after comma)
- Multiple categories: \`"Musik,Pop kultur"\` (NO SPACES after comma)
- Case-sensitive: Must match exactly

## Validation Rules
- At least 1 age group required
- At least 1 category required
- Children + Adults cannot both be present (conflicting focus)
- Categories must exist in predefined list

## Auto-classification
AI should suggest appropriate age groups and categories based on question content.
Manual review can override AI suggestions.

## Acceptance Criteria
- [ ] Age group validation enforced
- [ ] Category validation enforced
- [ ] Format validation (no spaces, exact spelling)
- [ ] Auto-classification implemented
- [ ] Manual override capability
- [ ] Database indexes on age_group and categories

## Related Epic
Part of: [EPIC] Core Question Generation System

## Documentation
See: [AI_QUESTION_GENERATION.md - Age Groups & Categories](../docs/AI_QUESTION_GENERATION.md#3-åldersgrupper-age-groups)
"@ --label "feature,backend,priority-high"

# Epic #2: Validation & Quality Control
Write-Host "`nCreating Epic #2: Validation & Quality Control..." -ForegroundColor Magenta
$epic2 = gh issue create --title "[EPIC] Validation & Quality Control" --body @"
## Epic Overview
Implement comprehensive validation system with AI-to-AI validation, confidence scoring, content filtering, duplicate detection, and manual review.

## Sub-tasks
- [ ] #ISSUE_AI_VALIDATION AI-to-AI Validation System
- [ ] #ISSUE_CONFIDENCE Confidence Score Calculation
- [ ] #ISSUE_CONTENT_FILTER Content Filtering System
- [ ] #ISSUE_DUPLICATES Semantic Duplicate Detection
- [ ] #ISSUE_MANUAL_REVIEW Manual Review System (Admin UI)

## Acceptance Criteria
- Multi-provider validation working
- Confidence scores calculated correctly (0-100%)
- Content filtering catches inappropriate content
- Duplicate detection prevents redundant questions
- Manual review can override AI decisions

## Documentation
See: [AI_QUESTION_GENERATION.md](../docs/AI_QUESTION_GENERATION.md)

## Milestone
Milestone 1: MVP - Basic Question Generation
"@ --label "epic,backend,priority-critical" --milestone "Milestone 1: MVP - Basic Question Generation"

Write-Host "✓ Epic #2 created" -ForegroundColor Green

# Feature #2.1: AI-to-AI Validation
Write-Host "Creating Feature: AI-to-AI Validation..." -ForegroundColor Blue
gh issue create --title "AI-to-AI Validation System" --body @"
## Description
Implement cross-provider validation where different AI providers validate questions generated by others.

## Validation Rules by Provider Count
- **2 providers**: 1 validates (the other one)
- **3 providers**: 2 validate (the other two)
- **4 providers**: 3 validate (all except generator)

## Enighet Bonus (Agreement Bonus)
- **All validators agree**: +20% confidence
- **Validators disagree**: -20% confidence

## What Validators Check
1. Question quality (clear, unambiguous)
2. Answer correctness (factually accurate)
3. Age appropriateness (suitable for target age group)
4. Language quality (grammar, spelling in both languages)
5. Category relevance (matches assigned categories)

## Validation Response Format
\`\`\`json
{
  "approved": true,
  "confidence": 85,
  "issues": [],
  "suggestions": ["Consider rephrasing for clarity"]
}
\`\`\`

## Acceptance Criteria
- [ ] Validator count logic implemented correctly
- [ ] Enighet bonus/penalty applied
- [ ] All validation checks performed
- [ ] Validation results stored in database
- [ ] Failed validations trigger review

## Related Epic
Part of: [EPIC] Validation & Quality Control

## Documentation
See: [AI_QUESTION_GENERATION.md - AI Validation](../docs/AI_QUESTION_GENERATION.md#71-ai-to-ai-validation)
"@ --label "feature,backend,priority-critical"

# Feature #2.2: Confidence Score Calculation
Write-Host "Creating Feature: Confidence Score Calculation..." -ForegroundColor Blue
gh issue create --title "Confidence Score Calculation (0-100%)" --body @"
## Description
Calculate confidence scores for generated questions based on AI validation results and other quality signals.

## Confidence Formula
\`\`\`
confidence_score = (
  ai_validation_score * 0.6 +
  content_filter_score * 0.2 +
  duplicate_check_score * 0.2
) + enighet_bonus
\`\`\`

## Confidence Thresholds
- **90-100%**: Auto-approve (show to players immediately)
- **70-89%**: Show to players (flag for later review)
- **0-69%**: Needs review (don't show until approved)

## Auto-Approval Blockers
Even with >=90% confidence, block if:
- Content filter flagged
- Duplicate detected (>70% similarity)
- Status is "quarantined" or "reported"
- Missing required fields

## Acceptance Criteria
- [ ] Confidence formula implemented
- [ ] Thresholds enforced correctly
- [ ] Auto-approval logic with blockers
- [ ] Confidence stored in database
- [ ] Confidence visible in admin UI

## Related Epic
Part of: [EPIC] Validation & Quality Control

## Documentation
See: [AI_QUESTION_GENERATION.md - Confidence Score](../docs/AI_QUESTION_GENERATION.md#72-confidence-score-förtroendepoäng)
"@ --label "feature,backend,priority-critical"

# Feature #2.3: Content Filtering
Write-Host "Creating Feature: Content Filtering..." -ForegroundColor Blue
gh issue create --title "Content Filtering System" --body @"
## Description
Implement content filtering to detect and block inappropriate, offensive, or harmful content in all languages.

## What to Filter
- Offensive language (profanity, slurs)
- Violence or gore
- Sexual content
- Hate speech
- Misinformation (obvious false claims)
- Personal information (PII)

## Filtering Approach
1. **Keyword filtering**: Check for known bad words (Swedish + English)
2. **AI content analysis**: Use AI to evaluate appropriateness
3. **Pattern matching**: Detect suspicious patterns

## Actions on Filter Trigger
- Set \`content_filter_passed = false\`
- Set \`status = "quarantined"\`
- Store reason in \`content_filter_reason\`
- Block from showing to players
- Alert admin for review

## Acceptance Criteria
- [ ] Content filter catches inappropriate content
- [ ] Works in both Swedish and English
- [ ] Reason stored for manual review
- [ ] Quarantined questions hidden from players
- [ ] Admin can override false positives

## Related Epic
Part of: [EPIC] Validation & Quality Control

## Documentation
See: [AI_QUESTION_GENERATION.md - Content Filtering](../docs/AI_QUESTION_GENERATION.md#73-content-filtering-innehållsfiltrering)
"@ --label "feature,backend,priority-high"

# Feature #2.4: Semantic Duplicate Detection
Write-Host "Creating Feature: Semantic Duplicate Detection..." -ForegroundColor Blue
gh issue create --title "Semantic Duplicate Detection" --body @"
## Description
Detect semantically similar questions to prevent duplicates, using soft-deleted questions for永久 duplicate checking.

## Similarity Thresholds
- **70-100%**: Duplicate (auto-discard, don't save)
- **50-69%**: Possible duplicate (flag for review, still save)
- **0-49%**: Unique (no action)

## Duplicate Detection Scope
- Check against ALL questions in database
- **Including soft-deleted questions** (never auto-cleanup)
- Use semantic similarity (not just exact text match)
- Check both Swedish and English versions

## Soft Delete System
- Deleted questions marked \`deleted_at\` but never removed
- Used for duplicate checking forever
- Can be restored if needed
- Hard delete only for sensitive content (special permissions)

## Technical Implementation
- Use embeddings for semantic comparison
- Store embedding vectors in database
- Calculate cosine similarity
- Index for performance

## Acceptance Criteria
- [ ] Semantic similarity calculation working
- [ ] Thresholds enforced correctly
- [ ] Soft-deleted questions included in checks
- [ ] Duplicate reason stored
- [ ] Flagged duplicates visible in admin UI

## Related Epic
Part of: [EPIC] Validation & Quality Control

## Documentation
See: [AI_QUESTION_GENERATION.md - Duplicate Detection](../docs/AI_QUESTION_GENERATION.md#74-semantic-duplicate-detection-semantisk-dubblettdetektering)
"@ --label "feature,backend,priority-high"

# Feature #2.5: Manual Review System
Write-Host "Creating Feature: Manual Review System..." -ForegroundColor Blue
gh issue create --title "Manual Review System (Admin UI)" --body @"
## Description
Create admin interface for manually reviewing, approving, editing, and rejecting AI-generated questions.

## Review Queue Priority
1. **Reported questions** (highest priority)
2. **Low confidence** (<70%)
3. **Flagged duplicates** (50-69% similarity)
4. **Content filter flags**
5. **Batch validation failures**

## Admin Actions
- **Approve**: Set \`manually_reviewed = true\`, \`status = "approved"\`
- **Edit & Approve**: Modify question, then approve
- **Reject**: Set \`status = "rejected"\`, mark as deleted
- **Quarantine**: Set \`status = "quarantined"\` (investigate further)

## Manual Review = Highest Priority
Manual decisions ALWAYS override AI decisions:
- Manual approval → show even if low confidence
- Manual rejection → hide even if high confidence

## Admin UI Features
- Review queue sorted by priority
- Show all AI validation details
- Edit question inline
- Bulk actions (approve multiple, reject multiple)
- Filter by status, confidence, age group, category

## Acceptance Criteria
- [ ] Admin UI shows review queue
- [ ] All admin actions implemented
- [ ] Manual review overrides AI
- [ ] Edit functionality working
- [ ] Bulk actions supported
- [ ] Audit log of manual reviews

## Related Epic
Part of: [EPIC] Validation & Quality Control

## Documentation
See: [AI_QUESTION_GENERATION.md - Manual Review](../docs/AI_QUESTION_GENERATION.md#75-manual-review-manuell-granskning)
"@ --label "feature,backend,frontend,priority-high"

Write-Host "`n=== Milestone 1 Issues Created Successfully ===" -ForegroundColor Green
Write-Host "✓ 2 Epics created" -ForegroundColor Cyan
Write-Host "✓ 9 Feature issues created" -ForegroundColor Cyan
Write-Host "`nView issues: gh issue list" -ForegroundColor Yellow
Write-Host "Or visit: https://github.com/tobbelta/Quizter/issues`n" -ForegroundColor Yellow
