'use client';

/**
 * Portfolio Debug Panel
 *
 * Observability UI for portfolio owners to inspect:
 * - Pipeline stage outputs (understanding, evidence, strategy, narrative, design, validation)
 * - Token usage and timing per stage
 * - Validation report (claim groundedness, warnings)
 * - Design brief selections
 * - Raw portfolio plan JSON
 *
 * Only visible to the portfolio owner. Hidden behind a debug toggle.
 */

import { ChevronDown, ChevronRight, Clock, Cpu, Eye, EyeOff, Zap } from 'lucide-react';
import { useState } from 'react';

import type { PortfolioPlan } from '@/types/portfolio';

interface DebugPanelProps {
  plan: PortfolioPlan;
  isOwner: boolean;
}

export function PortfolioDebugPanel({ plan, isOwner }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  if (!isOwner) return null;

  const pipeline = plan._pipeline;
  const generation = plan._generation;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const stages = [
    { key: 'understanding', label: 'Profile Understanding', data: pipeline.profileUnderstanding },
    { key: 'evidence', label: 'Evidence Extraction', data: pipeline.evidenceExtraction },
    { key: 'strategy', label: 'Portfolio Strategy', data: pipeline.portfolioStrategy },
    { key: 'narrative', label: 'Narrative Content', data: pipeline.narrativeContent },
    { key: 'design', label: 'Design Brief', data: pipeline.designBrief },
    { key: 'validation', label: 'Validation Report', data: pipeline.validationReport },
  ];

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full bg-gray-900 p-3 text-white shadow-lg transition-colors hover:bg-gray-800"
        title="Pipeline Debug"
      >
        {isOpen ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 max-h-[80vh] w-[480px] overflow-auto rounded-xl border bg-white text-sm shadow-2xl dark:bg-gray-950">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 dark:bg-gray-950">
            <h3 className="text-base font-semibold">Pipeline Debug</h3>
            <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {(generation.totalDurationMs / 1000).toFixed(1)}s total
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {generation.totalTokensUsed.input + generation.totalTokensUsed.output} tokens
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />v{generation.pipelineVersion}
              </span>
            </div>
          </div>

          {/* Generation Summary */}
          <div className="border-b px-4 py-3">
            <h4 className="mb-2 font-medium">Generation Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Theme</span>
                <p className="font-medium">{plan.style.colorTheme}</p>
              </div>
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Type Scale</span>
                <p className="font-medium">{plan.style.typeScale}</p>
              </div>
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Animation</span>
                <p className="font-medium">{plan.style.animationLevel}</p>
              </div>
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Density</span>
                <p className="font-medium">{plan.style.density}</p>
              </div>
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Pages</span>
                <p className="font-medium">{plan.pages.length}</p>
              </div>
              <div className="rounded bg-gray-50 p-2 dark:bg-gray-900">
                <span className="text-gray-500">Sections</span>
                <p className="font-medium">
                  {plan.pages.reduce((s, p) => s + p.sections.length, 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Stage Timings */}
          <div className="border-b px-4 py-3">
            <h4 className="mb-2 font-medium">Stage Timings</h4>
            <div className="space-y-1">
              {Object.entries(generation.stageDurations).map(([stage, ms]) => (
                <div key={stage} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-gray-600 dark:text-gray-400">
                    {stage.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded bg-blue-500"
                        style={{
                          width: `${Math.min(100, ((ms as number) / generation.totalDurationMs) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono">
                      {((ms as number) / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Summary */}
          {pipeline.validationReport && (
            <div className="border-b px-4 py-3">
              <h4 className="mb-2 font-medium">Validation</h4>
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={`rounded px-2 py-0.5 font-medium ${
                    pipeline.validationReport.passed
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}
                >
                  {pipeline.validationReport.passed ? 'PASSED' : 'FAILED'}
                </span>
                <span>Score: {(pipeline.validationReport.overallScore * 100).toFixed(0)}%</span>
                <span>{pipeline.validationReport.warnings.length} warnings</span>
                <span>{pipeline.validationReport.modifications.length} modifications</span>
              </div>
              {pipeline.validationReport.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pipeline.validationReport.warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`rounded px-2 py-1 text-xs ${
                        w.severity === 'high'
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : w.severity === 'medium'
                            ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                            : 'bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400'
                      }`}
                    >
                      [{w.severity}] {w.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pipeline Stages (Collapsible) */}
          <div className="px-4 py-3">
            <h4 className="mb-2 font-medium">Pipeline Outputs</h4>
            <div className="space-y-1">
              {stages.map(({ key, label, data }) => (
                <div key={key} className="rounded border">
                  <button
                    onClick={() => toggleSection(key)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span>{label}</span>
                    {expandedSections.has(key) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  {expandedSections.has(key) && (
                    <div className="px-3 pb-2">
                      <pre className="max-h-60 overflow-auto rounded bg-gray-50 p-2 font-mono text-xs dark:bg-gray-900">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Raw Plan */}
          <div className="border-t px-4 py-3">
            <button
              onClick={() => toggleSection('raw-plan')}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {expandedSections.has('raw-plan') ? 'Hide' : 'Show'} Raw Plan JSON
            </button>
            {expandedSections.has('raw-plan') && (
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-gray-50 p-2 font-mono text-xs dark:bg-gray-900">
                {JSON.stringify(plan, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
