/**
 * Admin dashboard för AI-frågesystemet.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';
import { useAuth } from '../context/AuthContext';
import { adminDashboardService } from '../services/adminDashboardService';
import { questionRepository } from '../repositories/questionRepository';

const numberFormatter = new Intl.NumberFormat('sv-SE');

const formatNumber = (value) => {
  if (value == null || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
};

const formatPercent = (value) => {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('sv-SE');
  } catch (error) {
    return value;
  }
};

const escapeCsv = (value) => {
  if (value == null) return '';
  const stringValue = String(value);
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const downloadBlob = (content, filename, type = 'text/plain') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const StatCard = ({ label, value, helper, tone = 'slate' }) => {
  const toneMap = {
    slate: 'border-slate-800 bg-slate-900',
    cyan: 'border-cyan-500/40 bg-slate-900/80',
    emerald: 'border-emerald-500/40 bg-slate-900/80',
    amber: 'border-amber-500/40 bg-slate-900/80',
    red: 'border-red-500/40 bg-slate-900/80',
  };

  return (
    <div className={`rounded-xl border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {helper && <div className="mt-1 text-xs text-slate-400">{helper}</div>}
    </div>
  );
};

const BarChart = ({ data }) => {
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-2 flex-1">
          <div className="w-full bg-slate-800 rounded-md flex items-end h-20">
            <div
              className="w-full rounded-md bg-cyan-500/80"
              style={{ height: `${(item.value / maxValue) * 100}%` }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
          <div className="text-[10px] text-slate-400 text-center">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

const LineChart = ({ data }) => {
  if (data.length === 0) {
    return <div className="text-sm text-slate-500">Ingen data ännu.</div>;
  }
  const values = data.map((item) => item.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1 || 1)) * 100;
    const y = 100 - ((value - minValue) / range) * 100;
    return `${x},${y}`;
  });
  const areaPoints = `0,100 ${points.join(' ')} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-28">
      <polygon points={areaPoints} fill="rgba(34, 211, 238, 0.15)" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="rgb(34, 211, 238)"
        strokeWidth="2"
      />
    </svg>
  );
};

const PieChart = ({ data }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const palette = ['#22d3ee', '#f97316', '#22c55e', '#facc15', '#60a5fa', '#f472b6', '#c084fc', '#f87171'];
  let current = 0;
  const segments = data.map((item, index) => {
    const start = current;
    const percent = (item.value / total) * 100;
    current += percent;
    return {
      ...item,
      color: palette[index % palette.length],
      start,
      end: current,
    };
  });

  const gradient = segments
    .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-6">
      <div
        className="h-28 w-28 rounded-full border border-slate-800"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="space-y-2 text-xs text-slate-300">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: segment.color }} />
            <span className="text-slate-300">{segment.label}</span>
            <span className="text-slate-500">{formatPercent(segment.value / total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProgressList = ({ tasks }) => {
  if (!tasks || tasks.length === 0) {
    return <div className="text-sm text-slate-500">Inga aktiva jobb just nu.</div>;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const completed = task.progress?.completed ?? task.progress?.percentage ?? 0;
        const total = task.progress?.total || 100;
        const percent = total ? (completed / total) * 100 : completed;
        const progressPercent = Math.min(100, Math.max(0, percent));
        return (
          <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between text-sm text-slate-200">
              <div className="font-semibold">{task.label || task.taskType}</div>
              <div className="text-xs text-slate-400">{task.status}</div>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-amber-400"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">{task.progress?.phase || 'Bearbetar...'}</div>
          </div>
        );
      })}
    </div>
  );
};

const AdminDashboardPage = () => {
  const { isSuperUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [isExporting, setIsExporting] = useState(false);
  const systemLabels = {
    calibration: 'Kalibrering',
    seasonal: 'Säsongsuppdatering',
    monthlyGeneration: 'Månadsgenerering',
    batchValidation: 'Batch-validering',
  };

  const loadStats = useCallback(async () => {
    try {
      setError('');
      const data = await adminDashboardService.fetchStats();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Kunde inte ladda dashboard-data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [isSuperUser, navigate, loadStats]);

  const handleExportStats = () => {
    if (!stats) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total frågor', stats.overview.totalQuestions],
      ['Godkända frågor', stats.overview.approvedQuestions],
      ['Underkända frågor', stats.overview.rejectedQuestions],
      ['Rapporterade frågor', stats.overview.reportedQuestions],
      ['Behöver granskning', stats.overview.needsReviewQuestions],
      ['Auto-godkännande', formatPercent(stats.overview.autoApprovalRate)],
      ['Snittkonfidens', stats.overview.avgConfidence ? stats.overview.avgConfidence.toFixed(1) : '—'],
      ['Valideringspass', formatPercent(stats.quality.validationPassRate)],
      ['Dublettgrad', formatPercent(stats.quality.duplicateRate)],
      ['Rapporterade kategorier', stats.engagement.topReportedCategories.length],
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    downloadBlob(csv, `quizter-admin-stats-${Date.now()}.csv`, 'text/csv');
  };

  const handleExportQuestions = async () => {
    setIsExporting(true);
    try {
      const questions = await questionRepository.listQuestions();
      const rows = [
        [
          'id',
          'question_sv',
          'question_en',
          'categories',
          'difficulty',
          'target_audience',
          'ai_validated',
          'manually_approved',
          'manually_rejected',
          'reported',
          'provider',
          'created_at',
        ],
        ...questions.map((question) => [
          question.id,
          question.languages?.sv?.text || question.question || '',
          question.languages?.en?.text || '',
          Array.isArray(question.categories) ? question.categories.join('|') : '',
          question.difficulty || '',
          question.targetAudience || '',
          question.aiValidated ? 'true' : 'false',
          question.manuallyApproved ? 'true' : 'false',
          question.manuallyRejected ? 'true' : 'false',
          question.reported ? 'true' : 'false',
          question.provider || '',
          question.createdAt || '',
        ]),
      ];
      const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
      downloadBlob(csv, `quizter-questions-${Date.now()}.csv`, 'text/csv');
    } catch (err) {
      setDialogConfig({
        isOpen: true,
        title: 'Export misslyckades',
        message: err.message || 'Kunde inte exportera frågedata',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    if (!stats) return;
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      setDialogConfig({
        isOpen: true,
        title: 'Popup blockerad',
        message: 'Tillåt popup-fönster för att skapa PDF-rapporten.',
        type: 'warning',
      });
      return;
    }

    reportWindow.document.write(`
      <html>
        <head>
          <title>Quizter Adminrapport</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin-bottom: 4px; }
            h2 { margin-top: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            td, th { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Quizter Adminrapport</h1>
          <div>Genererad: ${formatDateTime(stats.generatedAt)}</div>
          <h2>Översikt</h2>
          <table>
            <tr><th>Metric</th><th>Värde</th></tr>
            <tr><td>Total frågor</td><td>${formatNumber(stats.overview.totalQuestions)}</td></tr>
            <tr><td>Godkända frågor</td><td>${formatNumber(stats.overview.approvedQuestions)}</td></tr>
            <tr><td>Underkända frågor</td><td>${formatNumber(stats.overview.rejectedQuestions)}</td></tr>
            <tr><td>Rapporterade frågor</td><td>${formatNumber(stats.overview.reportedQuestions)}</td></tr>
            <tr><td>Behöver granskning</td><td>${formatNumber(stats.overview.needsReviewQuestions)}</td></tr>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const overviewCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Totalt antal frågor', value: formatNumber(stats.overview.totalQuestions), tone: 'slate' },
      { label: 'Godkända', value: formatNumber(stats.overview.approvedQuestions), tone: 'emerald' },
      { label: 'Underkända', value: formatNumber(stats.overview.rejectedQuestions), tone: 'red' },
      { label: 'Rapporterade', value: formatNumber(stats.overview.reportedQuestions), tone: 'amber' },
      { label: 'Behöver granskning', value: formatNumber(stats.overview.needsReviewQuestions), tone: 'cyan' },
      {
        label: 'Auto-godkännande',
        value: formatPercent(stats.overview.autoApprovalRate),
        helper: 'Andel som godkändes utan manuell åtgärd',
        tone: 'emerald',
      },
      {
        label: 'Snittkonfidens',
        value: stats.overview.avgConfidence ? stats.overview.avgConfidence.toFixed(1) : '—',
        helper: 'Baserat på AI-validering',
        tone: 'cyan',
      },
    ];
  }, [stats]);

  const confidenceBars = useMemo(() => {
    if (!stats) return [];
    return [
      { label: '0-69%', value: stats.quality.confidenceDistribution.low },
      { label: '70-89%', value: stats.quality.confidenceDistribution.mid },
      { label: '90-100%', value: stats.quality.confidenceDistribution.high },
    ];
  }, [stats]);

  const providerBars = useMemo(() => {
    if (!stats) return [];
    return stats.providers.generation.map((item) => ({
      label: item.provider,
      value: item.count,
    }));
  }, [stats]);

  const monthlySeries = useMemo(() => {
    if (!stats) return [];
    return stats.overview.monthlyGeneration.map((item) => ({
      label: item.month,
      value: item.total,
    }));
  }, [stats]);

  const categoryPie = useMemo(() => {
    if (!stats) return [];
    return stats.categoryDistribution.map((item) => ({
      label: item.category,
      value: item.count,
    }));
  }, [stats]);

  if (!isSuperUser) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Header title="Admin Dashboard" />
        <div className="flex items-center justify-center pt-32">
          <div className="text-lg text-slate-400">Laddar dashboard...</div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Header title="Admin Dashboard" />
        <main className="max-w-4xl mx-auto px-4 py-6 pt-24 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
              {error}
            </div>
          )}
          <button
            onClick={loadStats}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
          >
            Försök igen
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header title="Admin Dashboard" />
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pt-24">
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        )}

        {stats?.alerts?.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
            {stats.alerts.map((alert, index) => (
              <div
                key={`${alert.message}-${index}`}
                className={`rounded-lg px-3 py-2 text-sm ${
                  alert.type === 'error'
                    ? 'bg-red-500/20 text-red-200 border border-red-500/40'
                    : 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-sm text-slate-400">
            Uppdaterad: <span className="text-slate-200">{formatDateTime(stats?.generatedAt)}</span>
            <span className="ml-2 text-xs text-slate-500">Auto-uppdateras var 30s</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadStats}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
            >
              Uppdatera nu
            </button>
            <button
              onClick={handleExportStats}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-black text-sm font-semibold hover:bg-cyan-400 transition-colors"
            >
              Exportera statistik (CSV)
            </button>
            <button
              onClick={handleExportPdf}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
            >
              Månadrapport (PDF)
            </button>
            <button
              onClick={handleExportQuestions}
              disabled={isExporting}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60"
            >
              {isExporting ? 'Exporterar...' : 'Ladda ner frågedata'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Översikt</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overviewCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">📊 Frågor över tid</h3>
              <div className="text-xs text-slate-500">Senaste månader</div>
            </div>
            <div className="mt-4">
              <LineChart data={monthlySeries} />
              <div className="mt-3 grid grid-cols-3 text-xs text-slate-500">
                <div>Start</div>
                <div className="text-center">Nu</div>
                <div className="text-right">Totalt</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">🧭 Kategorifördelning</h3>
              <div className="text-xs text-slate-500">Toppkategorier</div>
            </div>
            <div className="mt-4">
              {categoryPie.length > 0 ? (
                <PieChart data={categoryPie} />
              ) : (
                <div className="text-sm text-slate-500">Ingen kategori-data ännu.</div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-base font-semibold text-white">✅ Kvalitetsmått</h3>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Valideringspass</span>
                <span className="text-emerald-300">{formatPercent(stats.quality.validationPassRate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Dublettgrad</span>
                <span className="text-amber-300">{formatPercent(stats.quality.duplicateRate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rapporterade</span>
                <span className="text-red-300">{formatNumber(stats.quality.reportedCount)}</span>
              </div>
            </div>
            <div className="mt-4">
              <BarChart data={confidenceBars} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <h3 className="text-base font-semibold text-white">🧑‍🤝‍🧑 Användarengagemang</h3>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Topprapporterade</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  {stats.engagement.topReportedCategories.length > 0 ? (
                    stats.engagement.topReportedCategories.map((item) => (
                      <div key={item.category} className="flex items-center justify-between">
                        <span>{item.category}</span>
                        <span className="text-amber-200">{formatNumber(item.count)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">Inga rapporter ännu.</div>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Svårighetsgrad</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  {stats.engagement.successRateByDifficulty.length > 0 ? (
                    stats.engagement.successRateByDifficulty.map((item) => (
                      <div key={item.difficulty} className="flex items-center justify-between">
                        <span>{item.difficulty}</span>
                        <span className="text-emerald-200">{formatPercent(item.rate)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">Svarsfrekvens saknas.</div>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Feedback</div>
                <div className="mt-3 text-sm text-slate-300">
                  {stats.engagement.feedbackRatio != null ? (
                    <span className="text-emerald-200">{formatPercent(stats.engagement.feedbackRatio)}</span>
                  ) : (
                    <span className="text-slate-500">Ej spårat ännu.</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">Populära frågor</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  {stats.engagement.popularQuestions.length > 0 ? (
                    stats.engagement.popularQuestions.map((question) => (
                      <div key={question.id} className="flex items-center justify-between gap-4">
                        <span className="truncate">{question.text}</span>
                        <span className="text-cyan-200">{formatNumber(question.totalAnswers)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">Ingen data ännu.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-base font-semibold text-white">🤖 AI-provider prestanda</h3>
            <div className="mt-4">
              {providerBars.length > 0 ? (
                <BarChart data={providerBars} />
              ) : (
                <div className="text-sm text-slate-500">Ingen provider-data ännu.</div>
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              {stats.providers.validation.length > 0 ? (
                stats.providers.validation.map((item) => (
                  <div key={item.provider} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <span>{item.provider}</span>
                      <span className="text-emerald-200">{formatPercent(item.passRate)}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Snittkonfidens: {item.avgConfidence ? item.avgConfidence.toFixed(1) : '—'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500">Ingen valideringsdata ännu.</div>
              )}
            </div>
            <div className="mt-4 text-xs text-slate-500">Kostnadsspårning saknas i nuläget.</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-base font-semibold text-white">⚙️ Automatiska system</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {Object.entries(stats.systems || {}).map(([key, system]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="capitalize">{systemLabels[key] || key}</span>
                  <span className="text-slate-400">
                    {system.lastRun ? formatDateTime(system.lastRun) : 'Ingen körning'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Pågående bakgrundsjobb
              </div>
              <ProgressList tasks={stats?.tasks?.active || []} />
            </div>
          </div>
        </section>
      </main>

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onClose={() => setDialogConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default AdminDashboardPage;
