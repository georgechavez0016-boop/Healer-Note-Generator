export interface CooldownEntry {
  phase: number;
  time: number; // seconds since phase start
  spec: string;
  spellId: number;
  playerName: string;
  bossSpellId?: number;
  frequency: number; // fraction of logs this appeared in (0-1)
}

export interface GeneratedNote {
  header: string;
  lines: string[];
  raw: string;
}

export function buildMrtNote(
  encounterID: number,
  encounterName: string,
  difficulty: string,
  entries: CooldownEntry[]
): GeneratedNote {
  const header = `EncounterID:${encounterID};Name:${encounterName} - ${difficulty};Difficulty:${difficulty}`;

  // Sort by phase, then by time within phase
  const sorted = [...entries].sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.time - b.time;
  });

  const lines: string[] = [];
  let currentPhase = -1;

  for (const entry of sorted) {
    if (entry.phase !== currentPhase) {
      currentPhase = entry.phase;
    }

    let line = `time:${entry.time};ph:${entry.phase};`;
    if (entry.bossSpellId) {
      line += `bossSpell:${entry.bossSpellId};`;
    }
    line += `tag:${entry.playerName};spellid:${entry.spellId};`;
    lines.push(line);
  }

  const raw = [header, ...lines].join('\n');
  return { header, lines, raw };
}

// Aggregate raw cast data into CooldownEntries using median timing
export interface RawCast {
  spellId: number;
  phase: number;
  timeInPhase: number; // seconds
}

export function aggregateCasts(
  castsBySpec: Map<string, RawCast[]>,
  totalLogs: number,
  minFrequency = 0.3,
  clusterWindowSec = 20
): Array<Omit<CooldownEntry, 'playerName'>> {
  const results: Array<Omit<CooldownEntry, 'playerName'>> = [];

  for (const [spec, casts] of castsBySpec.entries()) {
    // Group by (spellId, phase)
    const groups = new Map<string, number[]>();
    for (const cast of casts) {
      const key = `${cast.spellId}:${cast.phase}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(cast.timeInPhase);
    }

    for (const [key, times] of groups.entries()) {
      const [spellIdStr, phaseStr] = key.split(':');
      const spellId = Number(spellIdStr);
      const phase = Number(phaseStr);

      // Sort times and cluster into usage slots
      times.sort((a, b) => a - b);
      const clusters = clusterTimes(times, clusterWindowSec);

      for (const cluster of clusters) {
        const frequency = cluster.length / totalLogs;
        if (frequency < minFrequency) continue;

        const medianTime = median(cluster);
        results.push({
          phase,
          time: Math.round(medianTime),
          spec,
          spellId,
          frequency,
        });
      }
    }
  }

  return results;
}

function clusterTimes(sortedTimes: number[], windowSec: number): number[][] {
  if (sortedTimes.length === 0) return [];

  const clusters: number[][] = [[sortedTimes[0]]];

  for (let i = 1; i < sortedTimes.length; i++) {
    const current = clusters[clusters.length - 1];
    const clusterMedian = median(current);
    if (Math.abs(sortedTimes[i] - clusterMedian) <= windowSec) {
      current.push(sortedTimes[i]);
    } else {
      clusters.push([sortedTimes[i]]);
    }
  }

  return clusters;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
