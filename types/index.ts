import { HealerSpec } from '@/lib/cooldowns';

export interface HealerRosterEntry {
  spec: HealerSpec;
  playerName: string;
}

// MM:SS string → total seconds, returns null if blank/invalid
export function parseDuration(mmss: string): number | null {
  const trimmed = mmss.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
  }
  const secs = parseInt(trimmed, 10);
  if (!isNaN(secs)) return secs;
  return null;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface NoteResult {
  header: string;
  lines: string[];
  raw: string;
}

export interface UsedLog {
  code: string;
  fightID: number;
  url: string;
  duration?: number; // seconds
}

export interface GenerateResponse {
  note?: NoteResult;
  processedLogs?: number;
  matchingLogsFound?: number;
  entriesGenerated?: number;
  logsUsed?: UsedLog[];
  error?: string;
}

export interface Zone {
  id: number;
  name: string;
  encounters: { id: number; name: string }[];
}
