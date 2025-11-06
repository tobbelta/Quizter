import React from 'react';

/**
 * TaskTimeline - Visar en visuell timeline för en background task's livscykel
 * 
 * @param {Object} task - Background task objektet
 * @param {boolean} compact - Om true, visa kompakt version (för tabell-rad)
 */
const TaskTimeline = ({ task, compact = false }) => {
  // Definiera task stages baserat på taskType och progress
  const getStages = () => {
    const baseStages = [
      { key: 'created', label: 'Skapad', icon: '📝' },
      { key: 'queued', label: 'I kö', icon: '⏳' },
      { key: 'processing', label: 'Bearbetar', icon: '⚙️' },
    ];

    // Lägg till specifika stages baserat på taskType
    if (task.taskType === 'generation') {
      baseStages.push(
        { key: 'generating', label: 'Genererar', icon: '🤖' },
        { key: 'saving', label: 'Sparar', icon: '💾' },
        { key: 'checking', label: 'Kontrollerar', icon: '🔍' },
        { key: 'validating', label: 'Validerar', icon: '✅' }
      );
    } else if (task.taskType === 'batchvalidation') {
      baseStages.push(
        { key: 'validating', label: 'Validerar', icon: '✅' },
        { key: 'saving', label: 'Sparar', icon: '💾' }
      );
    } else if (task.taskType === 'migration') {
      baseStages.push(
        { key: 'analyzing', label: 'Analyserar', icon: '🔍' },
        { key: 'updating', label: 'Uppdaterar', icon: '🔄' }
      );
    }

    baseStages.push({ key: 'completed', label: 'Klar', icon: '🎉' });

    return baseStages;
  };

  // Bestäm vilken stage som är aktiv baserat på task status och progress
  const getCurrentStageIndex = () => {
    const stages = getStages();
    
    if (task.status === 'failed' || task.status === 'cancelled') {
      return -1; // Failure state
    }

    if (task.status === 'completed') {
      return stages.length - 1; // Last stage
    }

    if (task.status === 'queued' || task.status === 'pending') {
      return 1; // Queued stage
    }

    if (task.status === 'processing') {
      // Kolla progress.phase för att bestämma exakt stage
      if (task.progress?.phase) {
        const phase = task.progress.phase.toLowerCase();
        
        if (phase.includes('generer')) return stages.findIndex(s => s.key === 'generating');
        if (phase.includes('spar')) return stages.findIndex(s => s.key === 'saving');
        if (phase.includes('kontroll') || phase.includes('duplikat')) return stages.findIndex(s => s.key === 'checking');
        if (phase.includes('valider')) return stages.findIndex(s => s.key === 'validating');
        if (phase.includes('analys')) return stages.findIndex(s => s.key === 'analyzing');
        if (phase.includes('uppdater')) return stages.findIndex(s => s.key === 'updating');
      }

      // Om ingen specifik phase, använd progress percent
      if (task.progress?.total > 0) {
        const percent = (task.progress.completed / task.progress.total) * 100;
        const processingStages = stages.filter(s => 
          s.key !== 'created' && s.key !== 'queued' && s.key !== 'completed'
        );
        const stageIndex = Math.floor((percent / 100) * processingStages.length);
        return 2 + stageIndex; // 2 = efter queued
      }

      return 2; // Default processing stage
    }

    return 0; // Created stage
  };

  const stages = getStages();
  const currentStageIndex = getCurrentStageIndex();
  const isFailed = task.status === 'failed' || task.status === 'cancelled';

  // Kompakt version för tabell-rad
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;

          return (
            <React.Fragment key={stage.key}>
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs transition-all ${
                  isFailed && isCurrent
                    ? 'bg-red-500/30 text-red-300 ring-2 ring-red-500'
                    : isCompleted
                    ? 'bg-emerald-500/30 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-500/30 text-amber-300 ring-2 ring-amber-500 animate-pulse'
                    : 'bg-slate-700/30 text-slate-500'
                }`}
                title={stage.label}
              >
                {stage.icon}
              </div>
              {index < stages.length - 1 && (
                <div
                  className={`w-4 h-0.5 ${
                    isCompleted ? 'bg-emerald-500/50' : 'bg-slate-700/50'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Full version för detaljerad visning
  return (
    <div className="space-y-3">
      {/* Progress bar */}
      {task.progress?.total > 0 && task.status === 'processing' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{task.progress.phase || 'Bearbetar'}</span>
            <span>
              {task.progress.completed} / {task.progress.total} (
              {Math.round((task.progress.completed / task.progress.total) * 100)}%)
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-500"
              style={{
                width: `${Math.round((task.progress.completed / task.progress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Timeline stages */}
      <div className="relative">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.key} className="flex items-start gap-3 pb-4 relative">
              {/* Vertical line */}
              {!isLast && (
                <div
                  className={`absolute left-4 top-8 w-0.5 h-full ${
                    isCompleted ? 'bg-emerald-500/50' : 'bg-slate-700/50'
                  }`}
                />
              )}

              {/* Stage icon */}
              <div
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-sm transition-all ${
                  isFailed && isCurrent
                    ? 'bg-red-500/30 text-red-300 ring-4 ring-red-500/30'
                    : isCompleted
                    ? 'bg-emerald-500/30 text-emerald-300 ring-4 ring-emerald-500/20'
                    : isCurrent
                    ? 'bg-amber-500/30 text-amber-300 ring-4 ring-amber-500/30 animate-pulse'
                    : 'bg-slate-700/30 text-slate-500'
                }`}
              >
                {isFailed && isCurrent ? '❌' : stage.icon}
              </div>

              {/* Stage label */}
              <div className="flex-1 pt-0.5">
                <div
                  className={`font-semibold text-sm ${
                    isFailed && isCurrent
                      ? 'text-red-300'
                      : isCompleted
                      ? 'text-emerald-300'
                      : isCurrent
                      ? 'text-amber-300'
                      : 'text-slate-500'
                  }`}
                >
                  {stage.label}
                </div>
                {isCurrent && task.progress?.phase && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {task.progress.phase}
                  </div>
                )}
                {isCurrent && task.progress?.details && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {task.progress.details}
                  </div>
                )}
                {isFailed && isCurrent && task.error && (
                  <div className="text-xs text-red-400 mt-1 bg-red-500/10 px-2 py-1 rounded">
                    {task.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskTimeline;
