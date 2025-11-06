# AI Question Generation - Work Order & Dependencies

## 📋 Recommended Work Order

### 🔴 MILESTONE 1: MVP - Basic Question Generation (4-6 weeks)

#### Phase 1: Foundation (2-3 weeks) - START HERE! ⚡
**These MUST be done first - everything depends on them**

```
#68 - AI Provider Integration (XL effort, 1-2 weeks)
  ├─ OpenAI (gpt-4o-mini)
  ├─ Gemini (gemini-1.5-flash)
  ├─ Anthropic (claude-3.5-sonnet)
  ├─ Mistral (mistral-small-latest)
  └─ Random provider selection
  
#71 - Age Group & Category Classification (L effort, 1 week)
  ├─ Database schema (questions table)
  ├─ Age group validation
  └─ Category validation (30+ categories)
```

**⚠️ BLOCKER**: Nothing else can start until #68 is at least partially working!

---

#### Phase 2: Core Generation (2-3 weeks)
**Can start when Phase 1 is 50% complete**

```
#69 - Question Generation API (XL effort, 1-2 weeks)
  ├─ POST /api/generateAIQuestions
  ├─ Background task system (SSE)
  ├─ Progress tracking (6 phases)
  └─ Depends on: #68 ✅, #71 ✅
  
#70 - Dual-language Support (L effort, 1 week)
  ├─ Swedish + English mandatory
  ├─ Target audience logic
  ├─ Translation validation
  └─ Depends on: #69 (integrates into API)
```

**Parallel work possible**: #70 can start while #69 is in progress

---

#### Phase 3: Validation (3-4 weeks)
**Can start when Phase 2 is 30% complete (generation working)**

```
┌─ #73 - AI-to-AI Validation (XL effort, 1-2 weeks)
│   └─ Depends on: #68 ✅, #69 ✅
│
├─ #75 - Content Filtering (L effort, 1 week)
│   └─ Depends on: #68 ✅
│   └─ Can parallel with: #73, #76
│
├─ #76 - Semantic Duplicate Detection (L effort, 1 week)
│   └─ Depends on: #71 ✅
│   └─ Can parallel with: #73, #75
│
└─ #74 - Confidence Score Calculation (M effort, 1 week)
    └─ Depends on: #73 ✅, #75 ✅, #76 ✅
    └─ Must be done AFTER other validation
```

**⚡ Parallel opportunities**: #73, #75, #76 can work simultaneously!

---

#### Phase 4: Admin Interface (2 weeks)
**Can start when Phase 3 is 70% complete**

```
#77 - Manual Review System (XL effort, 2 weeks)
  ├─ Admin review queue
  ├─ Approve/Edit/Reject actions
  ├─ Manual override (highest priority)
  └─ Depends on: #74 ✅, #76 ✅
```

**🎯 MILESTONE 1 COMPLETE!** → Ready for production testing

---

### 🟡 MILESTONE 2: User Interaction & Feedback (2-3 weeks)

#### Phase 5: User Features
**Can start when M1 Phase 3 is stable**

```
┌─ #79 - Question Reporting System (L effort, 1 week)
│   └─ Depends on: M1 complete
│   └─ Can parallel with: #80
│
├─ #80 - User Feedback System (M effort, 1 week)
│   └─ Depends on: M1 complete
│   └─ Can parallel with: #79, #81
│
└─ #81 - Batch Validation Trigger (M effort, 1 week)
    └─ Depends on: #73 ✅, #79 ✅, #80 ✅
```

**⚡ Parallel opportunities**: #79 and #80 are independent!

---

### 🟢 MILESTONE 3: Automated Quality Systems (3-4 weeks)

#### Phase 6: Automation
**Can start after M1 is stable + M2 is working**

```
┌─ #83 - Difficulty Calibration (L effort, 1 week)
│   └─ Nightly cron (03:00)
│   └─ Depends on: M1 complete
│   └─ Can parallel with: #84, #85
│
├─ #84 - Seasonal Update System (M effort, 1 week)
│   └─ Weekly/monthly checks
│   └─ Depends on: #69 ✅, #73 ✅
│   └─ Can parallel with: #83, #86
│
├─ #85 - Auto-Approval System (M effort, 1 week)
│   └─ Auto-approve ≥90% confidence
│   └─ Depends on: #74 ✅
│   └─ Can parallel with: #83, #84
│
└─ #86 - Monthly Question Generation (L effort, 1 week)
    └─ First Monday of month
    └─ Depends on: #84 ✅, #85 ✅
```

**⚡ Parallel opportunities**: #83, #84, #85 are mostly independent!

---

### 🔵 MILESTONE 4: Advanced Features (2-3 weeks)

#### Phase 7: Advanced (LOW PRIORITY)
**These are enhancements - can be done anytime**

```
┌─ #88 - Category Preference System (M effort, 1 week)
│   └─ Depends on: M1 complete
│   └─ Can parallel with: All M4
│
├─ #89 - AI Illustration Generation (L effort, 3-5 days)
│   └─ DALL-E 3 integration
│   └─ Depends on: #68 ✅
│   └─ Can parallel with: All M4
│   └─ NICE TO HAVE - not blocking
│
├─ #90 - Soft Delete System (M effort, 1 week)
│   └─ Depends on: #71 ✅, #76 ✅
│   └─ Can parallel with: #88, #91
│
└─ #91 - Admin Dashboard Enhancements (L effort, 1 week)
    └─ Depends on: M1-M3 complete (needs data)
    └─ Can work independently
```

**💡 All M4 features can work in parallel!**

---

## 🎯 Quick Start Guide

### Week 1-2: Foundation
1. Start with **#68 - AI Provider Integration**
   - Get OpenAI working first (quickest to test)
   - Then add Gemini, Anthropic, Mistral
2. Parallel: **#71 - Database Schema**
   - Set up questions table
   - Test with mock data

### Week 3-4: Core Generation  
1. Build **#69 - Question Generation API**
   - Use providers from #68
   - Implement background tasks
2. Integrate **#70 - Dual-language**
   - Add to generation flow

### Week 5-7: Validation
1. Start all validation in parallel:
   - **#73** - AI validation (main focus)
   - **#75** - Content filter (quick win)
   - **#76** - Duplicate detection (medium)
2. Finish with **#74 - Confidence Score**

### Week 8-9: Admin UI
1. Build **#77 - Manual Review System**
2. Test complete M1 workflow

### Week 10+: Milestones 2-4
Follow the phase order, many can work in parallel!

---

## 📊 Effort Estimates

| Phase | Issues | Total Effort | Duration |
|-------|--------|--------------|----------|
| Phase 1 (Foundation) | #68, #71 | XL + L | 2-3 weeks |
| Phase 2 (Core) | #69, #70 | XL + L | 2-3 weeks |
| Phase 3 (Validation) | #73-76 | XL + M + 2L | 3-4 weeks |
| Phase 4 (Admin) | #77 | XL | 2 weeks |
| Phase 5 (User Features) | #79-81 | L + 2M | 2-3 weeks |
| Phase 6 (Automation) | #83-86 | 2L + 2M | 3-4 weeks |
| Phase 7 (Advanced) | #88-91 | 2M + 2L | 2-3 weeks |

**Total estimated time: 16-22 weeks** (4-5 months)
**With parallel work: 12-16 weeks** (3-4 months)

---

## 🚨 Critical Path

```
#68 (AI Providers)
  ↓
#69 (Generation API)
  ↓
#73 (AI Validation)
  ↓
#74 (Confidence Score)
  ↓
#77 (Admin Review)
  ↓
M1 COMPLETE ✅
```

Everything else can happen in parallel with or after these core features!

---

## 🎨 GitHub Project Board Setup

1. Go to: https://github.com/tobbelta/Quizter/projects
2. Create project: "AI Question Generation System"
3. Use Board template
4. Add columns:
   - 📝 Backlog
   - 🎯 Ready (blocked issues removed)
   - 🚧 In Progress
   - 👀 Review
   - ✅ Done

5. Add custom fields:
   - **Milestone**: M1, M2, M3, M4
   - **Phase**: Foundation, Core, Validation, Admin, User Features, Automation, Advanced
   - **Effort**: S, M, L, XL
   - **Blocked By**: Link to blocking issues

6. Populate in this order:
   - Phase 1 → Ready (start immediately)
   - Phase 2 → Backlog (blocked by Phase 1)
   - Phase 3-7 → Backlog (blocked by previous phases)

---

## 📚 Documentation

- **Full spec**: `docs/AI_QUESTION_GENERATION.md` (1685 lines)
- **Epic issues**: #67, #72, #78, #82, #87 (with dependencies)
- **Feature issues**: #68-77, #79-81, #83-86, #88-91

---

## 🤝 Team Coordination

**If working solo**: Follow phases sequentially
**If working with team**: 
- Person 1: #68 + #69 (critical path)
- Person 2: #71 + #75 (parallel work)
- Person 3: #76 + #77 (can start after #71)

---

**Last updated**: November 5, 2025
**Status**: Ready to begin! Start with #68 🚀
