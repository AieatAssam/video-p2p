import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Bug, ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import type { LogEntry } from '@/types';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  maxHeight?: number;
  className?: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-muted-foreground',
};

const levelLabels: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR ',
  debug: 'DBUG',
};

export function LogViewer({ logs, onClear, maxHeight = 300, className }: LogViewerProps) {
  const [collapsed, setCollapsed] = React.useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!collapsed && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const copyLogs = useCallback(() => {
    const text = logs
      .map((e) => `[${formatTime(e.timestamp)}] [${e.level.toUpperCase()}] ${e.message}`)
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for clipboard API failure
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }, [logs]);

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Show debug log' : 'Hide debug log'}
        >
          <Bug className="h-3.5 w-3.5" />
          Debug Log
          <span className="ml-1 text-[10px] text-muted-foreground/60">
            ({logs.length})
          </span>
          {collapsed ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyLogs}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Copy log"
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Clear log"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {/* Log content */}
      {!collapsed && (
        <div
          className="overflow-y-auto font-mono text-[11px] leading-relaxed"
          style={{ maxHeight }}
        >
          {logs.length === 0 ? (
            <div className="px-3 py-4 text-center text-muted-foreground/50 text-xs">
              No log entries yet. Load a video to see processing output.
            </div>
          ) : (
            <>
              {logs.map((entry, i) => (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className={cn(
                    'flex gap-2 border-b border-border/20 px-3 py-0.5 hover:bg-accent/30',
                    levelColors[entry.level] ?? 'text-foreground'
                  )}
                >
                  <span className="shrink-0 text-[10px] text-muted-foreground/50 w-[70px]">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="shrink-0 w-10 text-[10px] font-bold opacity-70">
                    {levelLabels[entry.level] ?? '    '}
                  </span>
                  <span className="break-all whitespace-pre-wrap min-w-0">
                    {entry.message}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
