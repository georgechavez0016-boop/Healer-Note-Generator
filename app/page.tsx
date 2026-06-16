'use client';

import { useEffect, useState } from 'react';
import { HealerSpec, SPEC_LABELS } from '@/lib/cooldowns';
import { HealerRosterEntry, GenerateResponse, Zone, UsedLog, parseDuration, formatDuration, EditableEntry, BossAbility, SpellInfo } from '@/types';
import { Timeline } from '@/app/components/Timeline';
import { buildMrtNote } from '@/lib/note-generator';

const HEALER_SPECS: HealerSpec[] = [
  'RestorationDruid',
  'MistweaverMonk',
  'PreservationEvoker',
  'RestorationShaman',
  'HolyPriest',
  'DisciplinePriest',
  'HolyPaladin',
];

const DIFFICULTIES = [
  { value: 5, label: 'Mythic' },
  { value: 4, label: 'Heroic' },
  { value: 3, label: 'Normal' },
];

const SPEC_COLORS: Record<HealerSpec, string> = {
  RestorationDruid:  'text-green-400',
  MistweaverMonk:    'text-teal-400',
  PreservationEvoker:'text-emerald-300',
  RestorationShaman: 'text-blue-400',
  HolyPriest:        'text-yellow-200',
  DisciplinePriest:  'text-purple-400',
  HolyPaladin:       'text-pink-300',
};

const SPEC_ICONS: Record<HealerSpec, string> = {
  RestorationDruid:  '🌿',
  MistweaverMonk:    '☯️',
  PreservationEvoker:'🐉',
  RestorationShaman: '⚡',
  HolyPriest:        '✨',
  DisciplinePriest:  '🔮',
  HolyPaladin:       '🛡️',
};

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesError, setZonesError] = useState('');
  const [loadingZones, setLoadingZones] = useState(true);

  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(5);
  const [logCount, setLogCount] = useState(30);

  const [roster, setRoster] = useState<HealerRosterEntry[]>([
    { spec: 'RestorationDruid', playerName: '' },
    { spec: 'MistweaverMonk', playerName: '' },
    { spec: 'PreservationEvoker', playerName: '' },
    { spec: 'RestorationShaman', playerName: '' },
  ]);

  function addHealer() {
    setRoster(prev => [...prev, { spec: 'RestorationDruid', playerName: '' }]);
  }

  function removeHealer(index: number) {
    setRoster(prev => prev.filter((_, i) => i !== index));
  }

  function updateSpec(index: number, spec: HealerSpec) {
    setRoster(prev => prev.map((r, i) => i === index ? { ...r, spec } : r));
  }

  function updatePlayerName(index: number, name: string) {
    setRoster(prev => prev.map((r, i) => i === index ? { ...r, playerName: name } : r));
  }

  const [minDurationStr, setMinDurationStr] = useState('');
  const [maxDurationStr, setMaxDurationStr] = useState('');
  const [minFrequency, setMinFrequency] = useState(30);
  const [showLogs, setShowLogs] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [editableEntries, setEditableEntries] = useState<EditableEntry[]>([]);
  const [bossAbilities, setBossAbilities] = useState<BossAbility[]>([]);
  const [phaseDurations, setPhaseDurations] = useState<Record<number, number>>({});
  const [spellIconMap, setSpellIconMap] = useState<Record<number, SpellInfo>>({});
  const [encounterMeta, setEncounterMeta] = useState<{ id: number; name: string; difficulty: string } | null>(null);

  useEffect(() => {
    fetch('/api/zones')
      .then(r => r.json())
      .then((data: Zone[] | { error: string }) => {
        if ('error' in data) {
          setZonesError(data.error);
        } else {
          setZones(data);
          if (data.length > 0) setSelectedZoneId(data[0].id);
        }
      })
      .catch(e => setZonesError(String(e)))
      .finally(() => setLoadingZones(false));
  }, []);

  const selectedZone = zones.find(z => z.id === selectedZoneId);
  const selectedEncounter = selectedZone?.encounters.find(e => e.id === selectedEncounterId);

  async function handleGenerate() {
    if (!selectedEncounterId || !selectedEncounter) return;

    if (roster.length === 0) {
      alert('Add at least one healer to the roster.');
      return;
    }
    const emptySlots = roster.filter(r => !r.playerName.trim());
    if (emptySlots.length > 0) {
      alert(`Please enter player names for: ${emptySlots.map(r => SPEC_LABELS[r.spec]).join(', ')}`);
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encounterID: selectedEncounterId,
          encounterName: selectedEncounter.name,
          difficulty: selectedDifficulty,
          healerRoster: roster.map(r => ({ ...r, playerName: r.playerName.trim() })),
          logCount,
          minDuration: parseDuration(minDurationStr) ?? undefined,
          maxDuration: parseDuration(maxDurationStr) ?? undefined,
          minFrequency: minFrequency / 100,
        }),
      });

      const data: GenerateResponse = await res.json();
      setResult(data);
      if (data.entries) setEditableEntries(data.entries);
      if (data.bossAbilities) setBossAbilities(data.bossAbilities);
      if (data.phaseDurations) setPhaseDurations(data.phaseDurations);
      if (data.spellIconMap) setSpellIconMap(data.spellIconMap as Record<number, SpellInfo>);
      setEncounterMeta({
        id: selectedEncounterId,
        name: selectedEncounter.name,
        difficulty: DIFFICULTIES.find(d => d.value === selectedDifficulty)?.label ?? 'Mythic',
      });
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setGenerating(false);
    }
  }

  function handleEntriesChange(newEntries: EditableEntry[]) {
    setEditableEntries(newEntries);
    if (!encounterMeta) return;
    const updatedNote = buildMrtNote(encounterMeta.id, encounterMeta.name, encounterMeta.difficulty, newEntries);
    setResult(prev => prev ? { ...prev, note: updatedNote } : prev);
  }

  async function copyNote() {
    if (!result?.note?.raw) return;
    await navigator.clipboard.writeText(result.note.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Healer CD Note Generator
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Analyses top Warcraft Logs kills to generate an MRT healer cooldown note for your raid.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Encounter selection */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            Encounter
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Zone / Raid</label>
              {loadingZones ? (
                <div className="h-10 bg-gray-800 rounded animate-pulse" />
              ) : zonesError ? (
                <p className="text-red-400 text-sm">{zonesError}</p>
              ) : (
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  value={selectedZoneId ?? ''}
                  onChange={e => {
                    const id = Number(e.target.value);
                    setSelectedZoneId(id);
                    setSelectedEncounterId(null);
                  }}
                >
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Boss</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                value={selectedEncounterId ?? ''}
                disabled={!selectedZone}
                onChange={e => setSelectedEncounterId(Number(e.target.value))}
              >
                <option value="">Select boss...</option>
                {selectedZone?.encounters.map(enc => (
                  <option key={enc.id} value={enc.id}>{enc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Difficulty</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={selectedDifficulty}
                onChange={e => setSelectedDifficulty(Number(e.target.value))}
              >
                {DIFFICULTIES.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Healer roster */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Your Healer Roster
            </h2>
            <button
              onClick={addHealer}
              disabled={roster.length >= 6}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-600 rounded text-gray-300 transition-colors"
            >
              + Add healer
            </button>
          </div>

          <div className="space-y-2">
            {roster.map((entry, index) => (
              <div
                key={index}
                className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5"
              >
                <span className="text-lg shrink-0">{SPEC_ICONS[entry.spec]}</span>

                <select
                  value={entry.spec}
                  onChange={e => updateSpec(index, e.target.value as HealerSpec)}
                  className={`bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500 ${SPEC_COLORS[entry.spec]}`}
                >
                  {HEALER_SPECS.map(spec => (
                    <option key={spec} value={spec}>{SPEC_LABELS[spec]}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Character name..."
                  value={entry.playerName}
                  onChange={e => updatePlayerName(index, e.target.value)}
                  className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />

                <button
                  onClick={() => removeHealer(index)}
                  disabled={roster.length <= 1}
                  className="shrink-0 text-gray-600 hover:text-red-400 disabled:opacity-20 transition-colors text-lg leading-none"
                  title="Remove healer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Options + generate */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            Analysis Options
          </h2>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Logs to analyse <span className="text-gray-600">(max matched kills)</span>
              </label>
              <input
                type="number"
                min={5}
                max={50}
                value={logCount}
                onChange={e => setLogCount(Number(e.target.value))}
                onBlur={e => setLogCount(Math.min(50, Math.max(5, Number(e.target.value) || 5)))}
                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Min duration <span className="text-gray-600">(MM:SS)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 6:30"
                value={minDurationStr}
                onChange={e => setMinDurationStr(e.target.value)}
                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Max duration <span className="text-gray-600">(MM:SS)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 10:00"
                value={maxDurationStr}
                onChange={e => setMaxDurationStr(e.target.value)}
                className="w-24 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                CD frequency <span className="text-gray-600">({minFrequency}% of logs)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">10%</span>
                <input
                  type="range"
                  min={10}
                  max={70}
                  step={5}
                  value={minFrequency}
                  onChange={e => setMinFrequency(Number(e.target.value))}
                  className="w-28 accent-blue-500"
                />
                <span className="text-xs text-gray-600">70%</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Lower = more abilities shown</p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !selectedEncounterId}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analysing logs...
                </span>
              ) : (
                'Generate Note'
              )}
            </button>
          </div>

          {generating && (
            <p className="mt-3 text-xs text-gray-500">
              Fetching and analysing up to {logCount} kill logs from Warcraft Logs. This may take 15–60 seconds.
            </p>
          )}
        </section>

        {/* Result */}
        {result && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Generated Note
              </h2>
              {result.note && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {result.processedLogs} logs · {result.entriesGenerated} entries
                  </span>
                  <button
                    onClick={copyNote}
                    className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                  >
                    {copied ? '✓ Copied!' : 'Copy to clipboard'}
                  </button>
                </div>
              )}
            </div>

            {result.error ? (
              <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
                {result.error}
              </div>
            ) : result.note ? (
              <>
                <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex gap-6 px-4 py-2 bg-gray-800 border-b border-gray-700 text-xs text-gray-400">
                    <span>Logs analysed: <strong className="text-white">{result.processedLogs}</strong></span>
                    <span>Matching kills found: <strong className="text-white">{result.matchingLogsFound}</strong></span>
                    <span>CD entries: <strong className="text-white">{result.entriesGenerated}</strong></span>
                  </div>
                  <pre className="p-4 text-xs text-green-300 font-mono whitespace-pre overflow-x-auto leading-relaxed">
                    {result.note.raw}
                  </pre>
                </div>

                {editableEntries.length > 0 && (
                  <div className="mt-4 mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
                      Timeline — drag cooldowns to adjust
                    </h3>
                    <Timeline
                      entries={editableEntries}
                      bossAbilities={bossAbilities}
                      phaseDurations={phaseDurations}
                      spellIconMap={spellIconMap}
                      onEntriesChange={handleEntriesChange}
                    />
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-600">
                  Paste this into your MRT (Method Raid Tools) note in-game. Times are seconds since each phase starts.
                  Review and adjust timings before your pull — these are aggregated from top kill patterns.
                </p>

                {result.logsUsed && result.logsUsed.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setShowLogs(l => !l)}
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <span className={`transition-transform ${showLogs ? 'rotate-90' : ''}`}>▶</span>
                      {showLogs ? 'Hide' : 'Show'} source logs ({result.logsUsed.length})
                    </button>

                    {showLogs && (
                      <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto] text-xs text-gray-500 px-3 py-1.5 bg-gray-800 border-b border-gray-700 font-medium uppercase tracking-wider">
                          <span>Report</span>
                          <span>Duration</span>
                        </div>
                        <ul className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                          {(result.logsUsed as UsedLog[]).map((log, i) => (
                            <li key={log.code + log.fightID} className="flex items-center justify-between px-3 py-2 hover:bg-gray-800 transition-colors">
                              <a
                                href={log.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                              >
                                {i + 1}. {log.code} #{log.fightID}
                              </a>
                              <span className="text-gray-500 text-xs ml-4 shrink-0">
                                {log.duration ? formatDuration(log.duration) : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
