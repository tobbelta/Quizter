/**
 * Admin-sida för AI-regler.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';
import { audienceService } from '../services/audienceService';

const createRuleRow = () => ({
  rowKey: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  pattern: '',
  issue: '',
  ageGroups: []
});

const normalizeRuleRow = (rule) => ({
  rowKey: rule.rowKey || `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  pattern: rule.pattern || '',
  issue: rule.issue || '',
  ageGroups: Array.isArray(rule.ageGroups) ? rule.ageGroups : []
});

const normalizeRuleList = (list) => (
  Array.isArray(list) ? list.map(normalizeRuleRow) : []
);

const normalizeFreshness = (freshness = {}, fallback = {}) => ({
  enabled: freshness?.enabled !== false,
  defaultShelfLifeDays: Number.isFinite(Number(freshness?.defaultShelfLifeDays))
    ? Number(freshness.defaultShelfLifeDays)
    : Number(fallback.defaultShelfLifeDays) || 365,
  minShelfLifeDays: Number.isFinite(Number(freshness?.minShelfLifeDays))
    ? Number(freshness.minShelfLifeDays)
    : Number(fallback.minShelfLifeDays) || 0,
  maxShelfLifeDays: Number.isFinite(Number(freshness?.maxShelfLifeDays))
    ? Number(freshness.maxShelfLifeDays)
    : Number(fallback.maxShelfLifeDays) || 3650,
  autoTimeSensitiveAgeGroups: Array.isArray(freshness?.autoTimeSensitiveAgeGroups)
    ? freshness.autoTimeSensitiveAgeGroups
    : Array.isArray(fallback.autoTimeSensitiveAgeGroups)
      ? fallback.autoTimeSensitiveAgeGroups
      : [],
  guidance: typeof freshness?.guidance === 'string'
    ? freshness.guidance
    : (fallback.guidance || '')
});

const normalizeConfig = (config = {}, targetAudiences = [], ageGroups = []) => {
  const global = config.global || {};
  const globalBlocklist = normalizeRuleList(global.blocklist || []);
  const globalFreshness = normalizeFreshness(global.freshness || {}, {
    defaultShelfLifeDays: 365,
    minShelfLifeDays: 30,
    maxShelfLifeDays: 1825,
    guidance: 'Markera frågor som tidskänsliga om de bygger på trender, nyheter, aktuella barnprogram eller tidsbundna händelser. Ange ett rimligt bäst före-datum.',
    autoTimeSensitiveAgeGroups: ['youth']
  });
  const maxQuestionLengthByAgeGroup = { ...(global.maxQuestionLengthByAgeGroup || {}) };
  ageGroups.forEach((group) => {
    if (!(group.id in maxQuestionLengthByAgeGroup)) {
      maxQuestionLengthByAgeGroup[group.id] = '';
    }
  });

  const targetMap = {};
  targetAudiences.forEach((target) => {
    const targetConfig = config.targetAudiences?.[target.id] || {};
    const hasCustomFreshness = Boolean(targetConfig.freshness);
    const resolvedFreshness = normalizeFreshness(targetConfig.freshness || globalFreshness, globalFreshness);
    targetMap[target.id] = {
      enabled: targetConfig.enabled !== false,
      blocklist: normalizeRuleList(targetConfig.blocklist || []),
      useCustomFreshness: hasCustomFreshness,
      freshness: resolvedFreshness
    };
  });

  return {
    global: {
      enabled: global.enabled !== false,
      answerInQuestion: {
        enabled: global.answerInQuestion?.enabled !== false,
        minAnswerLength: Number.isFinite(global.answerInQuestion?.minAnswerLength)
          ? Number(global.answerInQuestion.minAnswerLength)
          : 4
      },
      autoCorrection: {
        enabled: global.autoCorrection?.enabled === true
      },
      freshness: globalFreshness,
      maxQuestionLengthByAgeGroup,
      blocklist: globalBlocklist
    },
    targetAudiences: targetMap
  };
};

const serializeRuleList = (list) => (
  (list || [])
    .map((rule) => ({
      pattern: String(rule.pattern || '').trim(),
      issue: String(rule.issue || '').trim(),
      ageGroups: Array.isArray(rule.ageGroups) ? rule.ageGroups : []
    }))
    .filter((rule) => rule.pattern.length > 0)
);

const serializeFreshness = (freshness) => {
  if (!freshness) return null;
  const defaultShelfLifeDays = Number(freshness.defaultShelfLifeDays);
  const minShelfLifeDays = Number(freshness.minShelfLifeDays);
  const maxShelfLifeDays = Number(freshness.maxShelfLifeDays);
  const guidance = String(freshness.guidance || '').trim();
  const autoTimeSensitiveAgeGroups = Array.isArray(freshness.autoTimeSensitiveAgeGroups)
    ? freshness.autoTimeSensitiveAgeGroups
    : [];
  const result = {
    enabled: freshness.enabled !== false
  };
  if (Number.isFinite(defaultShelfLifeDays) && defaultShelfLifeDays > 0) {
    result.defaultShelfLifeDays = defaultShelfLifeDays;
  }
  if (Number.isFinite(minShelfLifeDays) && minShelfLifeDays > 0) {
    result.minShelfLifeDays = minShelfLifeDays;
  }
  if (Number.isFinite(maxShelfLifeDays) && maxShelfLifeDays > 0) {
    result.maxShelfLifeDays = maxShelfLifeDays;
  }
  if (guidance) {
    result.guidance = guidance;
  }
  if (autoTimeSensitiveAgeGroups.length > 0) {
    result.autoTimeSensitiveAgeGroups = autoTimeSensitiveAgeGroups;
  }
  return result;
};

const serializeConfig = (config) => {
  const maxByAgeGroup = {};
  Object.entries(config.global.maxQuestionLengthByAgeGroup || {}).forEach(([key, value]) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      maxByAgeGroup[key] = numeric;
    }
  });

  const targetAudiences = {};
  Object.entries(config.targetAudiences || {}).forEach(([targetId, targetConfig]) => {
    targetAudiences[targetId] = {
      enabled: targetConfig.enabled !== false,
      blocklist: serializeRuleList(targetConfig.blocklist),
      ...(targetConfig.useCustomFreshness
        ? { freshness: serializeFreshness(targetConfig.freshness) }
        : {})
    };
  });

  return {
    global: {
      enabled: config.global.enabled !== false,
      answerInQuestion: {
        enabled: config.global.answerInQuestion?.enabled !== false,
        minAnswerLength: Number(config.global.answerInQuestion?.minAnswerLength) || 4
      },
      autoCorrection: {
        enabled: config.global.autoCorrection?.enabled === true
      },
      freshness: serializeFreshness(config.global.freshness),
      maxQuestionLengthByAgeGroup: maxByAgeGroup,
      blocklist: serializeRuleList(config.global.blocklist)
    },
    targetAudiences
  };
};

const AdminAIRulesPage = () => {
  const { isSuperUser, currentUser } = useAuth();
  const navigate = useNavigate();
  const [ageGroups, setAgeGroups] = useState([]);
  const [targetAudiences, setTargetAudiences] = useState([]);
  const [rulesConfig, setRulesConfig] = useState(() => normalizeConfig({}, [], []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesResponse, audienceConfig] = await Promise.all([
        fetch('/api/ai-rules'),
        audienceService.getAudienceConfig({
          includeInactive: true,
          userEmail: currentUser?.email || '',
          force: true
        })
      ]);
      const rulesData = await rulesResponse.json();
      if (!rulesResponse.ok || !rulesData.success) {
        throw new Error(rulesData.error || 'Kunde inte ladda AI-regler');
      }
      const ageGroupList = audienceConfig.ageGroups || [];
      const targetList = audienceConfig.targetAudiences || [];
      setAgeGroups(ageGroupList);
      setTargetAudiences(targetList);
      setRulesConfig(normalizeConfig(rulesData.config || {}, targetList, ageGroupList));
      setIsDirty(false);
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte ladda AI-regler',
        message: error.message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadConfig();
  }, [isSuperUser, navigate, loadConfig]);

  const handleGlobalChange = (field, value) => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        [field]: value
      }
    }));
    setIsDirty(true);
  };

  const handleAnswerRuleChange = (field, value) => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        answerInQuestion: {
          ...prev.global.answerInQuestion,
          [field]: value
        }
      }
    }));
    setIsDirty(true);
  };

  const handleGlobalFreshnessChange = (field, value) => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        freshness: {
          ...prev.global.freshness,
          [field]: value
        }
      }
    }));
    setIsDirty(true);
  };

  const handleMaxLengthChange = (ageGroupId, value) => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        maxQuestionLengthByAgeGroup: {
          ...prev.global.maxQuestionLengthByAgeGroup,
          [ageGroupId]: value
        }
      }
    }));
    setIsDirty(true);
  };

  const handleGlobalRuleChange = (index, field, value) => {
    setRulesConfig((prev) => {
      const nextList = [...prev.global.blocklist];
      nextList[index] = { ...nextList[index], [field]: value };
      return {
        ...prev,
        global: {
          ...prev.global,
          blocklist: nextList
        }
      };
    });
    setIsDirty(true);
  };

  const toggleGlobalRuleAgeGroup = (index, ageGroupId) => {
    setRulesConfig((prev) => {
      const nextList = [...prev.global.blocklist];
      const rule = nextList[index];
      const set = new Set(rule.ageGroups || []);
      if (set.has(ageGroupId)) {
        set.delete(ageGroupId);
      } else {
        set.add(ageGroupId);
      }
      nextList[index] = { ...rule, ageGroups: Array.from(set) };
      return {
        ...prev,
        global: {
          ...prev.global,
          blocklist: nextList
        }
      };
    });
    setIsDirty(true);
  };

  const addGlobalRule = () => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        blocklist: [...prev.global.blocklist, createRuleRow()]
      }
    }));
    setIsDirty(true);
  };

  const removeGlobalRule = (index) => {
    setRulesConfig((prev) => ({
      ...prev,
      global: {
        ...prev.global,
        blocklist: prev.global.blocklist.filter((_, idx) => idx !== index)
      }
    }));
    setIsDirty(true);
  };

  const handleTargetRuleToggle = (targetId, enabled) => {
    setRulesConfig((prev) => ({
      ...prev,
      targetAudiences: {
        ...prev.targetAudiences,
        [targetId]: {
          ...(prev.targetAudiences[targetId] || {
            enabled: true,
            blocklist: [],
            useCustomFreshness: false,
            freshness: prev.global.freshness
          }),
          enabled
        }
      }
    }));
    setIsDirty(true);
  };

  const handleTargetFreshnessToggle = (targetId, enabled) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: false,
        freshness: prev.global.freshness
      };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            useCustomFreshness: enabled,
            freshness: targetConfig.freshness || prev.global.freshness
          }
        }
      };
    });
    setIsDirty(true);
  };

  const handleTargetFreshnessChange = (targetId, field, value) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: true,
        freshness: prev.global.freshness
      };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            freshness: {
              ...targetConfig.freshness,
              [field]: value
            }
          }
        }
      };
    });
    setIsDirty(true);
  };

  const handleTargetRuleChange = (targetId, index, field, value) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: false,
        freshness: prev.global.freshness
      };
      const nextList = [...targetConfig.blocklist];
      nextList[index] = { ...nextList[index], [field]: value };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            blocklist: nextList
          }
        }
      };
    });
    setIsDirty(true);
  };

  const toggleTargetRuleAgeGroup = (targetId, index, ageGroupId) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: false,
        freshness: prev.global.freshness
      };
      const nextList = [...targetConfig.blocklist];
      const rule = nextList[index];
      const set = new Set(rule.ageGroups || []);
      if (set.has(ageGroupId)) {
        set.delete(ageGroupId);
      } else {
        set.add(ageGroupId);
      }
      nextList[index] = { ...rule, ageGroups: Array.from(set) };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            blocklist: nextList
          }
        }
      };
    });
    setIsDirty(true);
  };

  const addTargetRule = (targetId) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: false,
        freshness: prev.global.freshness
      };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            blocklist: [...targetConfig.blocklist, createRuleRow()]
          }
        }
      };
    });
    setIsDirty(true);
  };

  const removeTargetRule = (targetId, index) => {
    setRulesConfig((prev) => {
      const targetConfig = prev.targetAudiences[targetId] || {
        enabled: true,
        blocklist: [],
        useCustomFreshness: false,
        freshness: prev.global.freshness
      };
      return {
        ...prev,
        targetAudiences: {
          ...prev.targetAudiences,
          [targetId]: {
            ...targetConfig,
            blocklist: targetConfig.blocklist.filter((_, idx) => idx !== index)
          }
        }
      };
    });
    setIsDirty(true);
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      const payload = serializeConfig(rulesConfig);
      const response = await fetch('/api/ai-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.email ? { 'x-user-email': currentUser.email } : {})
        },
        body: JSON.stringify({ config: payload })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Kunde inte spara AI-regler');
      }
      setRulesConfig(normalizeConfig(data.config || payload, targetAudiences, ageGroups));
      setIsDirty(false);
      setDialogConfig({
        isOpen: true,
        title: 'AI-regler sparade',
        message: 'Dina regler har uppdaterats.',
        type: 'success'
      });
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte spara AI-regler',
        message: error.message,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const sortedTargets = useMemo(() => (
    [...targetAudiences].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'sv'))
  ), [targetAudiences]);

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="AI-regler" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-10 space-y-8">
        {loading ? (
          <div className="text-center text-gray-400">Laddar AI-regler...</div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">Globala regler</h2>
                  <p className="text-sm text-slate-400">Gäller alla frågor oavsett målgrupp.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={rulesConfig.global.enabled !== false}
                    onChange={(event) => handleGlobalChange('enabled', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 text-cyan-400"
                  />
                  Aktivera globala regler
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <input
                    type="checkbox"
                    checked={rulesConfig.global.answerInQuestion.enabled !== false}
                    onChange={(event) => handleAnswerRuleChange('enabled', event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-600 text-cyan-400"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Blockera om svaret finns i frågetexten</div>
                    <div className="text-xs text-slate-400">Används för att hindra frågor som avslöjar svaret direkt.</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                      Minsta svarslängd
                      <input
                        type="number"
                        min="1"
                        value={rulesConfig.global.answerInQuestion.minAnswerLength}
                        onChange={(event) => handleAnswerRuleChange('minAnswerLength', event.target.value)}
                        className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                      />
                    </div>
                  </div>
                </label>

                <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="text-sm font-semibold text-slate-200">Max frågelängd per åldersgrupp</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-300">
                    {ageGroups.map((group) => (
                      <div key={group.id} className="flex items-center justify-between gap-2">
                        <span>{group.label || group.id}</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Ej satt"
                          value={rulesConfig.global.maxQuestionLengthByAgeGroup[group.id] ?? ''}
                          onChange={(event) => handleMaxLengthChange(group.id, event.target.value)}
                          className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={rulesConfig.global.autoCorrection.enabled === true}
                    onChange={(event) => handleGlobalChange('autoCorrection', { enabled: event.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-slate-600 text-cyan-400"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Auto‑korrigering efter AI‑validering</div>
                    <div className="text-xs text-slate-400">
                      Om på: godkänn AI‑förslag automatiskt och kör valideringen igen. Rekommenderas att vara avstängd som standard.
                    </div>
                  </div>
                </label>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-200">Aktualitet & bäst före</div>
                    <div className="text-xs text-slate-400">Styr hur AI bedömer om frågor är tidskänsliga.</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={rulesConfig.global.freshness.enabled !== false}
                      onChange={(event) => handleGlobalFreshnessChange('enabled', event.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 text-cyan-400"
                    />
                    Aktivera
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-slate-300">
                    Standard bäst före (dagar)
                    <input
                      type="number"
                      min="0"
                      value={rulesConfig.global.freshness.defaultShelfLifeDays}
                      onChange={(event) => handleGlobalFreshnessChange('defaultShelfLifeDays', event.target.value)}
                      className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Min bäst före (dagar)
                    <input
                      type="number"
                      min="0"
                      value={rulesConfig.global.freshness.minShelfLifeDays}
                      onChange={(event) => handleGlobalFreshnessChange('minShelfLifeDays', event.target.value)}
                      className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Max bäst före (dagar)
                    <input
                      type="number"
                      min="0"
                      value={rulesConfig.global.freshness.maxShelfLifeDays}
                      onChange={(event) => handleGlobalFreshnessChange('maxShelfLifeDays', event.target.value)}
                      className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Auto-markera tidskänslig för åldersgrupper</div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                    {ageGroups.map((group) => (
                      <label key={`freshness-auto-${group.id}`} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rulesConfig.global.freshness.autoTimeSensitiveAgeGroups.includes(group.id)}
                          onChange={() => {
                            const next = new Set(rulesConfig.global.freshness.autoTimeSensitiveAgeGroups || []);
                            if (next.has(group.id)) {
                              next.delete(group.id);
                            } else {
                              next.add(group.id);
                            }
                            handleGlobalFreshnessChange('autoTimeSensitiveAgeGroups', Array.from(next));
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-600 text-cyan-400"
                        />
                        {group.label || group.id}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="text-xs text-slate-300">
                  Riktlinjer till AI (fritext)
                  <textarea
                    rows="3"
                    value={rulesConfig.global.freshness.guidance}
                    onChange={(event) => handleGlobalFreshnessChange('guidance', event.target.value)}
                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Blocklista (globala regler)</h3>
                  <button
                    type="button"
                    onClick={addGlobalRule}
                    className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
                  >
                    + Lägg till regel
                  </button>
                </div>
                {rulesConfig.global.blocklist.length === 0 ? (
                  <div className="text-xs text-slate-400">Inga globala blocklist-regler.</div>
                ) : (
                  <div className="space-y-3">
                    {rulesConfig.global.blocklist.map((rule, index) => (
                      <div key={rule.rowKey} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs text-slate-400">Regex/fras</label>
                            <input
                              value={rule.pattern}
                              onChange={(event) => handleGlobalRuleChange(index, 'pattern', event.target.value)}
                              className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400">Felmeddelande</label>
                            <input
                              value={rule.issue}
                              onChange={(event) => handleGlobalRuleChange(index, 'issue', event.target.value)}
                              className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                          {ageGroups.map((group) => (
                            <label key={group.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rule.ageGroups.includes(group.id)}
                                onChange={() => toggleGlobalRuleAgeGroup(index, group.id)}
                                className="h-3.5 w-3.5 rounded border-slate-600 text-cyan-400"
                              />
                              {group.label || group.id}
                            </label>
                          ))}
                        </div>
                        <div className="text-right">
                          <button
                            type="button"
                            onClick={() => removeGlobalRule(index)}
                            className="text-xs text-red-300 hover:text-red-200"
                          >
                            Ta bort
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Regler per målgrupp</h2>
                <p className="text-sm text-slate-400">Extra regler som bara gäller vald målgrupp.</p>
              </div>
              <div className="space-y-4">
                {sortedTargets.map((target) => {
                  const targetConfig = rulesConfig.targetAudiences[target.id] || {
                    enabled: true,
                    blocklist: [],
                    useCustomFreshness: false,
                    freshness: rulesConfig.global.freshness
                  };
                  return (
                    <div key={target.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-200">{target.label || target.id}</div>
                          <div className="text-xs text-slate-400">{target.description || 'Ingen beskrivning.'}</div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={targetConfig.enabled !== false}
                            onChange={(event) => handleTargetRuleToggle(target.id, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-600 text-cyan-400"
                          />
                          Aktivera regler
                        </label>
                      </div>

                      <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-300">Aktualitet & bäst före</div>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={targetConfig.useCustomFreshness === true}
                              onChange={(event) => handleTargetFreshnessToggle(target.id, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-600 text-cyan-400"
                            />
                            Anpassa för målgruppen
                          </label>
                        </div>
                        {!targetConfig.useCustomFreshness && (
                          <div className="text-xs text-slate-400">Använder globala inställningar för aktualitet.</div>
                        )}
                        <div className={targetConfig.useCustomFreshness ? 'space-y-3' : 'space-y-3 opacity-60 pointer-events-none'}>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={targetConfig.freshness?.enabled !== false}
                              onChange={(event) => handleTargetFreshnessChange(target.id, 'enabled', event.target.checked)}
                              className="h-4 w-4 rounded border-slate-600 text-cyan-400"
                            />
                            Aktivera för målgruppen
                          </label>
                        <div className="grid gap-3 md:grid-cols-3">
                            <label className="text-xs text-slate-300">
                              Standard bäst före (dagar)
                              <input
                                type="number"
                                min="0"
                                value={targetConfig.freshness?.defaultShelfLifeDays ?? ''}
                                onChange={(event) => handleTargetFreshnessChange(target.id, 'defaultShelfLifeDays', event.target.value)}
                                className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                              />
                            </label>
                            <label className="text-xs text-slate-300">
                              Min bäst före (dagar)
                              <input
                                type="number"
                                min="0"
                                value={targetConfig.freshness?.minShelfLifeDays ?? ''}
                                onChange={(event) => handleTargetFreshnessChange(target.id, 'minShelfLifeDays', event.target.value)}
                                className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                              />
                            </label>
                            <label className="text-xs text-slate-300">
                              Max bäst före (dagar)
                              <input
                                type="number"
                                min="0"
                                value={targetConfig.freshness?.maxShelfLifeDays ?? ''}
                                onChange={(event) => handleTargetFreshnessChange(target.id, 'maxShelfLifeDays', event.target.value)}
                                className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
                              />
                            </label>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-300">Auto-markera tidskänslig för åldersgrupper</div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                            {ageGroups.map((group) => (
                              <label key={`target-${target.id}-freshness-auto-${group.id}`} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={(targetConfig.freshness?.autoTimeSensitiveAgeGroups || []).includes(group.id)}
                                  onChange={() => {
                                    const current = new Set(targetConfig.freshness?.autoTimeSensitiveAgeGroups || []);
                                    if (current.has(group.id)) {
                                      current.delete(group.id);
                                    } else {
                                      current.add(group.id);
                                    }
                                    handleTargetFreshnessChange(target.id, 'autoTimeSensitiveAgeGroups', Array.from(current));
                                  }}
                                  className="h-3.5 w-3.5 rounded border-slate-600 text-cyan-400"
                                />
                                {group.label || group.id}
                              </label>
                            ))}
                          </div>
                        </div>
                        <label className="text-xs text-slate-300">
                          Riktlinjer till AI (fritext)
                          <textarea
                              rows="2"
                              value={targetConfig.freshness?.guidance || ''}
                              onChange={(event) => handleTargetFreshnessChange(target.id, 'guidance', event.target.value)}
                              className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-300">Blocklista</div>
                        <button
                          type="button"
                          onClick={() => addTargetRule(target.id)}
                          className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
                        >
                          + Lägg till regel
                        </button>
                      </div>

                      {targetConfig.blocklist.length === 0 ? (
                        <div className="text-xs text-slate-400">Inga regler för denna målgrupp.</div>
                      ) : (
                        <div className="space-y-3">
                          {targetConfig.blocklist.map((rule, index) => (
                            <div key={rule.rowKey} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <label className="text-xs text-slate-400">Regex/fras</label>
                                  <input
                                    value={rule.pattern}
                                    onChange={(event) => handleTargetRuleChange(target.id, index, 'pattern', event.target.value)}
                                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-slate-400">Felmeddelande</label>
                                  <input
                                    value={rule.issue}
                                    onChange={(event) => handleTargetRuleChange(target.id, index, 'issue', event.target.value)}
                                    className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                                {ageGroups.map((group) => (
                                  <label key={`${target.id}-${group.id}`} className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={rule.ageGroups.includes(group.id)}
                                      onChange={() => toggleTargetRuleAgeGroup(target.id, index, group.id)}
                                      className="h-3.5 w-3.5 rounded border-slate-600 text-cyan-400"
                                    />
                                    {group.label || group.id}
                                  </label>
                                ))}
                              </div>
                              <div className="text-right">
                                <button
                                  type="button"
                                  onClick={() => removeTargetRule(target.id, index)}
                                  className="text-xs text-red-300 hover:text-red-200"
                                >
                                  Ta bort
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={loadConfig}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Återställ
              </button>
              <button
                type="button"
                onClick={saveRules}
                disabled={saving || !isDirty}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {saving ? 'Sparar...' : 'Spara regler'}
              </button>
            </div>
          </>
        )}
      </div>

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </div>
  );
};

export default AdminAIRulesPage;
