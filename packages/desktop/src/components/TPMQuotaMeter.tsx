/**
 * TPM Quota Meter - Displays token usage and quota status.
 *
 * Shows real-time TPM (Tokens Per Minute) utilization with color-coded progress bar.
 */

interface TPMQuotaMeterProps {
  tokensUsed: number;
  tokensRemaining: number;
  limitTPM: number;
  utilizationPercent: number;
}

export function TPMQuotaMeter({
  tokensUsed,
  tokensRemaining,
  limitTPM,
  utilizationPercent,
}: TPMQuotaMeterProps) {
  // Determine color based on utilization
  const getColor = () => {
    if (utilizationPercent < 70) return 'bg-green-500';
    if (utilizationPercent < 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = () => {
    if (utilizationPercent < 70) return 'text-green-400';
    if (utilizationPercent < 90) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="glass-dark rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 font-medium">TPM Quota</span>
        <span className={`font-mono font-bold ${getTextColor()}`}>
          {utilizationPercent.toFixed(1)}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <div className="flex items-center gap-2">
          <span>Used: <span className="text-white font-mono">{tokensUsed.toLocaleString()}</span></span>
          <span className="text-gray-600">•</span>
          <span>Left: <span className="text-white font-mono">{tokensRemaining.toLocaleString()}</span></span>
        </div>
        <span className="text-gray-600">
          / {limitTPM.toLocaleString()} TPM
        </span>
      </div>

      {/* Warning */}
      {utilizationPercent > 90 && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>Quota near limit</span>
        </div>
      )}
    </div>
  );
}
