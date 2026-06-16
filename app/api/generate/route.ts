import { NextRequest, NextResponse } from 'next/server';
import { wclQuery, sleep } from '@/lib/wcl-client';
import {
  HealerSpec,
  WCL_SPEC_MAP,
  ALL_COOLDOWN_IDS,
  SPELL_TO_SPEC,
} from '@/lib/cooldowns';
import {
  aggregateCasts,
  buildMrtNote,
  RawCast,
  CooldownEntry,
} from '@/lib/note-generator';
import { HealerRosterEntry } from '@/types';

interface GenerateRequest {
  encounterID: number;
  encounterName: string;
  difficulty: number; // 5 = Mythic, 4 = Heroic, 3 = Normal
  healerRoster: HealerRosterEntry[];
  logCount: number;
  minDuration?: number; // seconds, optional
  maxDuration?: number; // seconds, optional
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
  query Report($code: String!, $fightID: Int!, $filter: String!) {
    reportData {
      report(code: $code) {
        fights(fightIDs: [$fightID]) {
          id
          startTime
          endTime
          phaseTransitions {
            id
            startTime
          }
        }
        events(
          startTime: 0
          endTime: 99999999
          dataType: Casts
          fightIDs: [$fightID]
          filterExpression: $filter
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

const MORE_EVENTS_QUERY = `
  query MoreEvents($code: String!, $fightID: Int!, $filter: String!, $startTime: Float!) {
    reportData {
      report(code: $code) {
        events(
          startTime: $startTime
          endTime: 99999999
          dataType: Casts
          fightIDs: [$fightID]
          filterExpression: $filter
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

interface ReportData {
  reportData: {
    report: {
      fights: Fight[];
      events: { data: CastEvent[]; nextPageTimestamp: number | null };
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
  required: HealerSpec[]
): boolean {
  if (!composition?.length) return true; // no composition data → include optimistically

  const found = new Set<HealerSpec>();

  for (const player of composition) {
    // WCL composition spec field can come as player.spec (string) or player.specs[].spec
    const specName =
      player.spec ??
      (player.specs && player.specs.length > 0 ? player.specs[0].spec : undefined);

    if (!specName) continue;

    const key = `${player.type}-${specName}`;
    const mapped = WCL_SPEC_MAP[key];
    if (mapped) found.add(mapped);
  }

  return required.every(spec => found.has(spec));
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

  const { encounterID, encounterName, difficulty, healerRoster, logCount, minDuration, maxDuration } = body;

  if (!encounterID || !healerRoster?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const requiredSpecs = requiredSpecsFromRoster(healerRoster);
  const spellFilter = `ability.id IN (${ALL_COOLDOWN_IDS.join(',')})`;

  // ── Step 1: Collect matching log codes ─────────────────────────────────────
  const matchingLogs: Array<{ code: string; fightID: number; duration?: number }> = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 10;

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

      if (compositionMatchesRequiredSpecs(ranking.composition, requiredSpecs)) {
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

  let processedLogs = 0;
  const BATCH_SIZE = 5;
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
            filter: spellFilter,
          });

          const report = reportData.reportData.report;
          if (!report?.fights?.length) return;

          const fight = report.fights[0];
          const phases = buildPhaseMap(fight);

          // Collect all pages of events
          let events: CastEvent[] = [...(report.events?.data ?? [])];
          let nextPage = report.events?.nextPageTimestamp;

          while (nextPage) {
            const more = await wclQuery<{
              reportData: {
                report: { events: { data: CastEvent[]; nextPageTimestamp: number | null } };
              };
            }>(MORE_EVENTS_QUERY, {
              code,
              fightID,
              filter: spellFilter,
              startTime: nextPage,
            });
            const moreEvents = more.reportData.report.events;
            events = events.concat(moreEvents.data ?? []);
            nextPage = moreEvents.nextPageTimestamp;
          }

          // Map each cast to spec + phase-relative time
          for (const event of events) {
            if (event.type !== 'cast') continue;
            const spellId = event.abilityGameID;
            const spec = SPELL_TO_SPEC[spellId];
            if (!spec || !requiredSpecs.includes(spec)) continue;

            const { phase, timeInPhase } = getPhaseForTimestamp(
              event.timestamp,
              phases
            );

            castsBySpec.get(spec)?.push({ spellId, phase, timeInPhase });
          }

          usedLogs.push({ code, fightID, duration });
          processedLogs++;
        } catch (err) {
          fetchErrors.push(`${code}/${fightID}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );

    if (i + BATCH_SIZE < matchingLogs.length) await sleep(300);
  }

  if (processedLogs === 0) {
    const detail = fetchErrors.length > 0 ? ` First error: ${fetchErrors[0]}` : '';
    return NextResponse.json({
      error: `Could not fetch event data from any of the ${matchingLogs.length} matching logs.${detail}`,
    }, { status: 500 });
  }

  // ── Step 3: Aggregate and build note ─────────────────────────────────────
  const aggregated = aggregateCasts(castsBySpec, processedLogs, 0.3, 20);

  // Map spec -> player name from roster
  const specToPlayer = new Map(healerRoster.map(r => [r.spec, r.playerName]));

  const entries: CooldownEntry[] = aggregated.map(e => ({
    ...e,
    playerName: specToPlayer.get(e.spec as HealerSpec) ?? e.spec,
  }));

  const diffLabel = DIFFICULTY_LABELS[difficulty] ?? `Difficulty${difficulty}`;
  const note = buildMrtNote(encounterID, encounterName, diffLabel, entries);

  const logsUsed = usedLogs.map(({ code, fightID, duration }) => ({
    code,
    fightID,
    duration,
    url: `https://www.warcraftlogs.com/reports/${code}#fight=${fightID}`,
  }));

  return NextResponse.json({
    note,
    processedLogs,
    matchingLogsFound: matchingLogs.length,
    entriesGenerated: entries.length,
    logsUsed,
  });
}
