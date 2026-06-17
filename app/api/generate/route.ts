import { NextRequest, NextResponse } from 'next/server';
import { wclQuery, sleep } from '@/lib/wcl-client';
import {
  HealerSpec,
  WCL_SPEC_MAP,
  ALL_COOLDOWN_IDS,
  SPELL_TO_SPEC,
  SPELL_COOLDOWNS,
} from '@/lib/cooldowns';
import {
  aggregateCasts,
  buildMrtNote,
  RawCast,
  CooldownEntry,
} from '@/lib/note-generator';
import { HealerRosterEntry, EditableEntry, SpellInfo, BossAbility } from '@/types';

interface GenerateRequest {
  encounterID: number;
  encounterName: string;
  difficulty: number; // 5 = Mythic, 4 = Heroic, 3 = Normal
  healerRoster: HealerRosterEntry[];
  logCount: number;
  minDuration?: number;
  maxDuration?: number;
  minFrequency?: number; // 0-1, default 0.3
  minSpecMatches?: number; // how many of the required specs must be present, default = all
}

// ── GraphQL queries ──────────────────────────────────────────────────────────

const RANKINGS_QUERY = `
  query Rankings($encounterID: Int!, $difficulty: Int!, $page: Int!) {
    worldData {
      encounter(id: $encounterID) {
        name
        fightRankings(difficulty: $difficulty, page: $page)
      }
    }
  }
`;

const REPORT_QUERY = `
  query Report($code: String!, $fightID: Int!, $healerFilter: String!) {
    reportData {
      report(code: $code) {
        masterData(translate: true) {
          abilities {
            gameID
            name
            icon
          }
        }
        fights(fightIDs: [$fightID]) {
          id
          startTime
          endTime
          phaseTransitions {
            id
            startTime
          }
        }
        playerDetails(fightIDs: [$fightID])
        healerEvents: events(
          startTime: 0
          endTime: 99999999
          dataType: Casts
          fightIDs: [$fightID]
          filterExpression: $healerFilter
        ) {
          data
          nextPageTimestamp
        }
        bossEvents: events(
          startTime: 0
          endTime: 99999999
          dataType: Casts
          fightIDs: [$fightID]
          hostilityType: Enemies
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

const MORE_EVENTS_QUERY = `
  query MoreEvents($code: String!, $fightID: Int!, $healerFilter: String!, $startTime: Float!) {
    reportData {
      report(code: $code) {
        healerEvents: events(
          startTime: $startTime
          endTime: 99999999
          dataType: Casts
          fightIDs: [$fightID]
          filterExpression: $healerFilter
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

// ── Types ────────────────────────────────────────────────────────────────────

interface RankingEntry {
  report: { code: string; fightID: number };
  duration?: number; // ms
  composition?: Array<{
    name: string;
    type: string;
    specs?: Array<{ spec: string; count: number }>;
    spec?: string;
  }>;
}

interface FightRankingsJson {
  page: number;
  hasMorePages: boolean;
  count: number;
  rankings: RankingEntry[];
}

interface PhaseTransition {
  id: number;
  startTime: number; // ms relative to fight start
}

interface Fight {
  id: number;
  startTime: number;
  endTime: number;
  phaseTransitions?: PhaseTransition[];
}

interface CastEvent {
  timestamp: number;
  type: string;
  sourceID: number;
  abilityGameID: number;
}

interface AbilityInfo { gameID: number; name: string; icon: string; }

interface PlayerDetailEntry {
  name: string;
  id: number;
  type: string;
  spec?: string;
  specs?: Array<{ spec: string; count: number }>;
}

interface ReportData {
  reportData: {
    report: {
      masterData: { abilities: AbilityInfo[] };
      fights: Fight[];
      playerDetails?: {
        data?: {
          playerDetails?: {
            healers?: PlayerDetailEntry[];
          };
        };
      };
      healerEvents: { data: CastEvent[]; nextPageTimestamp: number | null };
      bossEvents: { data: CastEvent[]; nextPageTimestamp: number | null };
    };
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<number, string> = {
  5: 'Mythic',
  4: 'Heroic',
  3: 'Normal',
  10: 'LFR',
};

function requiredSpecsFromRoster(roster: HealerRosterEntry[]): HealerSpec[] {
  return roster.map(r => r.spec);
}

function compositionMatchesRequiredSpecs(
  composition: RankingEntry['composition'],
  required: HealerSpec[],
  minMatches: number
): boolean {
  if (!composition?.length) return true; // no composition data from rankings → verified post-hoc during event processing

  const found = new Set<HealerSpec>();

  for (const player of composition) {
    const specName =
      player.spec ??
      (player.specs && player.specs.length > 0 ? player.specs[0].spec : undefined);
    if (!specName) continue;
    const key = `${player.type}-${specName}`;
    const mapped = WCL_SPEC_MAP[key];
    if (mapped && required.includes(mapped)) found.add(mapped);
  }

  return found.size >= minMatches;
}

function buildPhaseMap(fight: Fight): Array<{ id: number; startMs: number }> {
  if (fight.phaseTransitions && fight.phaseTransitions.length > 0) {
    return fight.phaseTransitions
      .map(p => ({ id: p.id, startMs: fight.startTime + p.startTime }))
      .sort((a, b) => a.startMs - b.startMs);
  }
  // No phase data: treat entire fight as phase 1
  return [{ id: 1, startMs: fight.startTime }];
}

function getPhaseForTimestamp(
  absoluteMs: number,
  phases: Array<{ id: number; startMs: number }>
): { phase: number; timeInPhase: number } {
  let current = phases[0];
  for (const phase of phases) {
    if (absoluteMs >= phase.startMs) current = phase;
    else break;
  }
  const timeInPhase = Math.round((absoluteMs - current.startMs) / 1000);
  return { phase: current.id, timeInPhase: Math.max(0, timeInPhase) };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { encounterID, encounterName, difficulty, healerRoster, logCount, minDuration, maxDuration, minFrequency = 0.3, minSpecMatches } = body;
  const requiredSpecCount = minSpecMatches ?? healerRoster.length;

  if (!encounterID || !healerRoster?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const requiredSpecs = requiredSpecsFromRoster(healerRoster);
  const spellFilter = `ability.id IN (${ALL_COOLDOWN_IDS.join(',')})`;

  // ── Step 1: Collect matching log codes ─────────────────────────────────────
  const matchingLogs: Array<{ code: string; fightID: number; duration?: number }> = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 20;

  while (matchingLogs.length < logCount && hasMore && page <= MAX_PAGES) {
    type RankingsResponse = {
      worldData: {
        encounter: { name: string; fightRankings: FightRankingsJson };
      };
    };

    let rankData: RankingsResponse;
    try {
      rankData = await wclQuery<RankingsResponse>(RANKINGS_QUERY, {
        encounterID,
        difficulty,
        page,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Rankings fetch failed: ${message}` }, { status: 500 });
    }

    const fightRankings = rankData.worldData.encounter.fightRankings;
    if (!fightRankings?.rankings?.length) break;

    hasMore = fightRankings.hasMorePages;

    for (const ranking of fightRankings.rankings) {
      if (matchingLogs.length >= logCount) break;
      if (!ranking.report?.code) continue;

      // Deduplicate by report code to avoid pulling the same report twice
      if (matchingLogs.some(l => l.code === ranking.report.code)) continue;

      // Duration filter (ranking.duration is in ms)
      if (ranking.duration !== undefined) {
        const durationSec = ranking.duration / 1000;
        if (minDuration !== undefined && durationSec < minDuration) continue;
        if (maxDuration !== undefined && durationSec > maxDuration) continue;
      }

      if (compositionMatchesRequiredSpecs(ranking.composition, requiredSpecs, requiredSpecCount)) {
        matchingLogs.push({
          code: ranking.report.code,
          fightID: ranking.report.fightID,
          duration: ranking.duration ? Math.round(ranking.duration / 1000) : undefined,
        });
      }
    }

    page++;
    if (page <= MAX_PAGES && matchingLogs.length < logCount) await sleep(200);
  }

  if (matchingLogs.length === 0) {
    return NextResponse.json({
      error: 'No matching logs found. Try relaxing the composition filter or choosing a different encounter/difficulty.',
    }, { status: 404 });
  }

  // ── Step 2: Fetch cast events for each matching log ─────────────────────────
  // castsBySpec maps spec -> array of RawCast from all logs combined
  const castsBySpec = new Map<string, RawCast[]>(
    requiredSpecs.map(spec => [spec, []])
  );

  const bossCastsBySpell = new Map<string, Array<{ phase: number; time: number }>>();
  const abilityInfoMap = new Map<number, { name: string; icon: string }>();

  let processedLogs = 0;
  const BATCH_SIZE = 3;
  const fetchErrors: string[] = [];
  const usedLogs: Array<{ code: string; fightID: number; duration?: number }> = [];

  for (let i = 0; i < matchingLogs.length; i += BATCH_SIZE) {
    const batch = matchingLogs.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ code, fightID, duration }) => {
        try {
          const reportData = await wclQuery<ReportData>(REPORT_QUERY, {
            code,
            fightID,
            healerFilter: spellFilter,
          });

          const report = reportData.reportData.report;
          if (!report?.fights?.length) return;

          const fight = report.fights[0];
          const phases = buildPhaseMap(fight);

          // Collect all pages of healer events
          let events: CastEvent[] = [...(report.healerEvents?.data ?? [])];
          let nextPage = report.healerEvents?.nextPageTimestamp;

          while (nextPage) {
            const more = await wclQuery<{
              reportData: {
                report: { healerEvents: { data: CastEvent[]; nextPageTimestamp: number | null } };
              };
            }>(MORE_EVENTS_QUERY, {
              code,
              fightID,
              healerFilter: spellFilter,
              startTime: nextPage,
            });
            const moreEvents = more.reportData.report.healerEvents;
            events = events.concat(moreEvents.data ?? []);
            nextPage = moreEvents.nextPageTimestamp;
          }

          // Collect this log's healer casts into a per-spec buffer first
          // so we can verify composition before merging into the main accumulator
          const logCasts = new Map<string, RawCast[]>(
            requiredSpecs.map(s => [s, []])
          );

          for (const event of events) {
            if (event.type !== 'cast') continue;
            const spellId = event.abilityGameID;
            const spec = SPELL_TO_SPEC[spellId];
            if (!spec || !requiredSpecs.includes(spec as HealerSpec)) continue;
            const { phase, timeInPhase } = getPhaseForTimestamp(event.timestamp, phases);
            logCasts.get(spec)?.push({ spellId, phase, timeInPhase });
          }

          // Composition check: use playerDetails healer roles (authoritative).
          // Falls back to cast inference only if playerDetails is absent.
          const healerRoles = report.playerDetails?.data?.playerDetails?.healers;
          let specsPresent: HealerSpec[];
          if (healerRoles && healerRoles.length > 0) {
            const healerSpecsInLog = new Set<HealerSpec>();
            for (const healer of healerRoles) {
              const specName = healer.spec ?? healer.specs?.[0]?.spec;
              if (!specName) continue;
              const mapped = WCL_SPEC_MAP[`${healer.type}-${specName}`];
              if (mapped) healerSpecsInLog.add(mapped);
            }
            specsPresent = requiredSpecs.filter(s => healerSpecsInLog.has(s));
          } else {
            specsPresent = requiredSpecs.filter(
              s => (logCasts.get(s)?.length ?? 0) > 0
            );
          }
          if (specsPresent.length < requiredSpecCount) return;

          // Composition verified — merge into main accumulator
          for (const [spec, casts] of logCasts) {
            castsBySpec.get(spec)?.push(...casts);
          }

          // collect ability info from masterData
          for (const ab of report.masterData?.abilities ?? []) {
            if (!abilityInfoMap.has(ab.gameID)) {
              abilityInfoMap.set(ab.gameID, { name: ab.name, icon: ab.icon });
            }
          }

          // collect boss cast events
          for (const event of report.bossEvents?.data ?? []) {
            if (event.type !== 'cast') continue;
            const { phase, timeInPhase } = getPhaseForTimestamp(event.timestamp, phases);
            const key = String(event.abilityGameID);
            if (!bossCastsBySpell.has(key)) bossCastsBySpell.set(key, []);
            bossCastsBySpell.get(key)!.push({ phase, time: timeInPhase });
          }

          usedLogs.push({ code, fightID, duration });
          processedLogs++;
        } catch (err) {
          fetchErrors.push(`${code}/${fightID}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );

    if (i + BATCH_SIZE < matchingLogs.length) await sleep(500);
  }

  if (processedLogs === 0) {
    const detail = fetchErrors.length > 0 ? ` First error: ${fetchErrors[0]}` : '';
    return NextResponse.json({
      error: `Could not fetch event data from any of the ${matchingLogs.length} matching logs.${detail}`,
    }, { status: 500 });
  }

  // ── Step 3: Aggregate and build note ─────────────────────────────────────
  const aggregated = aggregateCasts(castsBySpec, processedLogs, minFrequency, 20);

  // Map spec -> player name from roster
  const specToPlayer = new Map(healerRoster.map(r => [r.spec, r.playerName]));

  const entriesRaw: CooldownEntry[] = aggregated.map(e => ({
    ...e,
    playerName: specToPlayer.get(e.spec as HealerSpec) ?? e.spec,
  }));

  // Remove entries that violate spell cooldown durations.
  // Convert phase-relative times to approximate absolute seconds using phaseDurations
  // so we can compare across phase boundaries.
  const rawPhaseDurations: Record<number, number> = {};
  for (const e of entriesRaw) {
    rawPhaseDurations[e.phase] = Math.max(rawPhaseDurations[e.phase] ?? 0, e.time + 20);
  }
  const sortedPhases = Object.keys(rawPhaseDurations).map(Number).sort((a, b) => a - b);
  function toAbsolute(phase: number, t: number): number {
    let abs = 0;
    for (const ph of sortedPhases) {
      if (ph < phase) abs += rawPhaseDurations[ph];
      else break;
    }
    return abs + t;
  }

  // Group by (spec, spellId), sort by absolute time, drop entries too close to the previous use
  const cdGroups = new Map<string, CooldownEntry[]>();
  for (const e of entriesRaw) {
    const key = `${e.spec}:${e.spellId}`;
    if (!cdGroups.has(key)) cdGroups.set(key, []);
    cdGroups.get(key)!.push(e);
  }
  const entries: CooldownEntry[] = [];
  for (const group of cdGroups.values()) {
    const cd = SPELL_COOLDOWNS[group[0].spellId];
    if (!cd) { entries.push(...group); continue; }
    const sorted = [...group].sort((a, b) => toAbsolute(a.phase, a.time) - toAbsolute(b.phase, b.time));
    let lastAbs = -Infinity;
    for (const e of sorted) {
      const abs = toAbsolute(e.phase, e.time);
      if (abs - lastAbs >= cd) { entries.push(e); lastAbs = abs; }
    }
  }

  const diffLabel = DIFFICULTY_LABELS[difficulty] ?? `Difficulty${difficulty}`;
  const note = buildMrtNote(encounterID, encounterName, diffLabel, entries);

  const logsUsed = usedLogs.map(({ code, fightID, duration }) => ({
    code,
    fightID,
    duration,
    url: `https://www.warcraftlogs.com/reports/${code}#fight=${fightID}`,
  }));

  // ── Step 4: Aggregate boss abilities ─────────────────────────────────────
  const bossAbilities: BossAbility[] = [];
  for (const [spellIdStr, casts] of bossCastsBySpell.entries()) {
    const spellId = Number(spellIdStr);
    const byPhase = new Map<number, number[]>();
    for (const c of casts) {
      if (!byPhase.has(c.phase)) byPhase.set(c.phase, []);
      byPhase.get(c.phase)!.push(c.time);
    }
    for (const [phase, times] of byPhase.entries()) {
      times.sort((a, b) => a - b);
      const clusters: number[][] = [];
      for (const t of times) {
        const last = clusters[clusters.length - 1];
        if (last && Math.abs(t - last[last.length - 1]) <= 15) {
          last.push(t);
        } else {
          clusters.push([t]);
        }
      }
      for (const cluster of clusters) {
        const frequency = cluster.length / processedLogs;
        if (frequency < 0.6) continue;
        const sorted = [...cluster].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianTime = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        bossAbilities.push({ spellId, phase, time: Math.round(medianTime), frequency });
      }
    }
  }

  // ── Step 5: Build editable entries, phaseDurations, spellIconMap ─────────
  const editableEntries: EditableEntry[] = entries.map((e, i) => ({
    id: `entry-${i}`,
    phase: e.phase,
    time: e.time,
    spec: e.spec,
    spellId: e.spellId,
    playerName: e.playerName,
    frequency: e.frequency,
  }));

  const phaseDurations: Record<number, number> = {};
  for (const e of editableEntries) {
    phaseDurations[e.phase] = Math.max(phaseDurations[e.phase] ?? 0, e.time + 20);
  }
  for (const b of bossAbilities) {
    phaseDurations[b.phase] = Math.max(phaseDurations[b.phase] ?? 0, b.time + 20);
  }
  for (const ph of Object.keys(phaseDurations)) {
    phaseDurations[Number(ph)] = Math.max(phaseDurations[Number(ph)], 60);
  }

  const spellIconMap: Record<number, SpellInfo> = {};
  for (const [id, info] of abilityInfoMap.entries()) {
    spellIconMap[id] = info;
  }

  return NextResponse.json({
    note,
    processedLogs,
    matchingLogsFound: matchingLogs.length,
    entriesGenerated: entries.length,
    logsUsed,
    entries: editableEntries,
    bossAbilities,
    phaseDurations,
    spellIconMap,
  });
}
