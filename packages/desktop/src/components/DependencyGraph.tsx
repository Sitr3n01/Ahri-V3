/**
 * Dependency Graph Visualization - Shows task dependencies as a flow diagram.
 */

import type { AgentWorkerType } from '@ahri/shared';

interface Step {
  worker: AgentWorkerType;
  description?: string;
  depends_on?: number[];
}

interface DependencyGraphProps {
  steps: Step[];
}

export function DependencyGraph({ steps }: DependencyGraphProps) {
  // Group steps by dependency level for vertical layout
  const buildLevels = (): number[][] => {
    const levels: number[][] = [];
    const processed = new Set<number>();
    const inProgress = new Set<number>();

    // Calculate dependency depth for each step
    const getDepth = (stepIdx: number): number => {
      if (inProgress.has(stepIdx)) return 0; // Circular dependency
      if (processed.has(stepIdx)) return depthCache[stepIdx] || 0;

      inProgress.add(stepIdx);
      const deps = steps[stepIdx]?.depends_on || [];
      const maxDepth = deps.length > 0
        ? Math.max(...deps.map(d => getDepth(d))) + 1
        : 0;

      processed.add(stepIdx);
      inProgress.delete(stepIdx);
      depthCache[stepIdx] = maxDepth;
      return maxDepth;
    };

    const depthCache: Record<number, number> = {};
    steps.forEach((_, idx) => getDepth(idx));

    // Group by depth
    const maxDepth = Math.max(...Object.values(depthCache), 0);
    for (let d = 0; d <= maxDepth; d++) {
      levels[d] = [];
    }

    steps.forEach((_, idx) => {
      const depth = depthCache[idx] || 0;
      levels[depth].push(idx);
    });

    return levels;
  };

  const levels = buildLevels();

  // Worker icon/color mapping
  const getWorkerColor = (worker: AgentWorkerType): string => {
    const colors: Record<AgentWorkerType, string> = {
      RAG: 'bg-purple-500',
      Code: 'bg-blue-500',
      Shell: 'bg-green-500',
      Memory: 'bg-pink-500',
      Web: 'bg-cyan-500',
      Vision: 'bg-orange-500',
      Browser: 'bg-indigo-500',
      Router: 'bg-yellow-500',
    };
    return colors[worker] || 'bg-gray-500';
  };

  const getWorkerIcon = (worker: AgentWorkerType): string => {
    const icons: Record<AgentWorkerType, string> = {
      RAG: '🔍',
      Code: '💻',
      Shell: '⚡',
      Memory: '🧠',
      Web: '🌐',
      Vision: '👁️',
      Browser: '🌍',
      Router: '🔀',
    };
    return icons[worker] || '⚙️';
  };

  return (
    <div className="glass-dark rounded-lg p-4 overflow-x-auto">
      <h3 className="text-sm font-semibold text-white mb-4">Execution Graph</h3>

      <div className="flex items-start gap-8">
        {levels.map((level, levelIdx) => (
          <div key={levelIdx} className="flex flex-col gap-4 min-w-[120px]">
            {/* Level label */}
            <div className="text-[10px] text-gray-500 font-mono text-center mb-2">
              Level {levelIdx}
            </div>

            {/* Steps in this level */}
            {level.map((stepIdx) => {
              const step = steps[stepIdx];
              return (
                <div key={stepIdx} className="relative">
                  {/* Step card */}
                  <div className="glass rounded-lg p-3 border border-white/20 hover:border-white/40 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-6 h-6 rounded-full ${getWorkerColor(step.worker)} flex items-center justify-center text-xs`}>
                        {getWorkerIcon(step.worker)}
                      </div>
                      <span className="text-xs font-semibold text-white">
                        {step.worker}
                      </span>
                    </div>

                    {step.description && (
                      <p className="text-[10px] text-gray-400 line-clamp-2">
                        {step.description}
                      </p>
                    )}

                    {/* Step number badge */}
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-mono text-white border border-white/40">
                      {stepIdx}
                    </div>
                  </div>

                  {/* Dependency arrows (pointing to this step from previous level) */}
                  {step.depends_on && step.depends_on.length > 0 && (
                    <div className="absolute -left-8 top-1/2 transform -translate-y-1/2 w-8 flex items-center">
                      <svg className="w-full h-0.5">
                        <line
                          x1="0"
                          y1="1"
                          x2="32"
                          y2="1"
                          stroke="currentColor"
                          strokeWidth="1"
                          className="text-white/30"
                        />
                        <polygon
                          points="28,0 32,1 28,2"
                          fill="currentColor"
                          className="text-white/30"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Parallel indicator */}
            {level.length > 1 && (
              <div className="text-[10px] text-cyan-400 font-mono text-center -mt-2">
                ⚡ Parallel
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="flex items-center gap-4 text-[10px] text-gray-500">
          <span className="font-semibold text-gray-400">Workers:</span>
          {Array.from(new Set(steps.map(s => s.worker))).map(worker => (
            <div key={worker} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${getWorkerColor(worker)}`} />
              <span>{worker}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
