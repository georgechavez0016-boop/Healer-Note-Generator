'use client';

import { useRef, useState } from 'react';
import { EditableEntry, BossAbility, SpellInfo } from '@/types';
import { SPEC_LABELS } from '@/lib/cooldowns';
import type { HealerSpec } from '@/lib/cooldowns';

interface TimelineProps {
  entries: EditableEntry[];
  bossAbilities: BossAbility[];
  phaseDurations: Record<number, number>;
  spellIconMap: Record<number, SpellInfo>;
  onEntriesChange: (entries: EditableEntry[]) => void;
}

const SPEC_COLORS: Record<string, string> = {
  RestorationDruid: '#4ade80',
  MistweaverMonk: '#2dd4bf',
  PreservationEvoker: '#6ee7b7',
  RestorationShaman: '#60a5fa',
  HolyPriest: '#fef08a',
  DisciplinePriest: '#c084fc',
  HolyPaladin: '#f9a8d4',
};

const SPEC_ICONS: Record<string, string> = {
  RestorationDruid: '🌿',
  MistweaverMonk: '☯️',
  PreservationEvoker: '🐉',
  RestorationShaman: '⚡',
  HolyPriest: '✨',
  DisciplinePriest: '🔮',
  HolyPaladin: '🛡️',
};

function SpellIcon({ spellId, spellIconMap, size = 32 }: { spellId: number; spellIconMap: Record<number, SpellInfo>; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const info = spellIconMap[spellId];
  const iconUrl = info?.icon && !imgError
    ? `https://wow.zamimg.com/images/wow/icons/medium/${info.icon}.jpg`
    : null;
  return (
    <div style={{ width: size, height: size, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
      {iconUrl ? (
        <img
          src={iconUrl}
          width={size}
          height={size}
          alt={info?.name ?? String(spellId)}
          style={{ objectFit: 'cover', display: 'block' }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div style={{ width: size, height: size, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>
          {spellId % 1000}
        </div>
      )}
    </div>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${s}s`;
}

export function Timeline({ entries, bossAbilities, phaseDurations, spellIconMap, onEntriesChange }: TimelineProps) {
  const phases = Object.keys(phaseDurations).map(Number).sort((a, b) => a - b);
  const [hiddenBossSpells, setHiddenBossSpells] = useState<Set<number>>(new Set());

  function toggleBossSpell(spellId: number) {
    setHiddenBossSpells(prev => {
      const next = new Set(prev);
      if (next.has(spellId)) next.delete(spellId); else next.add(spellId);
      return next;
    });
  }

  // Ordered unique players from entries
  const players: Array<{ name: string; spec: string }> = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!seen.has(e.playerName)) {
      seen.add(e.playerName);
      players.push({ name: e.playerName, spec: e.spec });
    }
  }

  const draggingRef = useRef<{ entryId: string; startX: number; startTime: number; phaseDuration: number } | null>(null);
  const timelineAreaRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  function handleIconPointerDown(e: React.PointerEvent, entry: EditableEntry, phaseDuration: number) {
    e.preventDefault();
    draggingRef.current = { entryId: entry.id, startX: e.clientX, startTime: entry.time, phaseDuration };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleTimelinePointerMove(e: React.PointerEvent, phase: number, playerName: string) {
    const d = draggingRef.current;
    if (!d) return;
    const key = `${phase}-${playerName}`;
    const el = timelineAreaRefs.current.get(key);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(d.phaseDuration, Math.round(pct * d.phaseDuration)));
    onEntriesChange(entries.map(en => en.id === d.entryId ? { ...en, time: newTime } : en));
  }

  function handlePointerUp() {
    draggingRef.current = null;
  }

  const LABEL_W = 130;
  const ROW_H = 56;
  const BOSS_ROW_H = 50;
  const ICON_SIZE = 32;
  const BOSS_ICON_SIZE = 28;

  return (
    <div style={{ width: '100%' }}>
      {phases.map(phase => {
        const duration = phaseDurations[phase];
        const phaseEntries = entries.filter(e => e.phase === phase);
        const phaseBossAbilities = bossAbilities.filter(b => b.phase === phase);

        // Tick marks every 15s
        const ticks: number[] = [];
        for (let t = 0; t <= duration; t += 15) ticks.push(t);

        return (
          <div key={phase} style={{ marginBottom: 24, background: '#111827', borderRadius: 8, border: '1px solid #1f2937', overflow: 'hidden' }}>
            {/* Phase header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#1f2937', borderBottom: '1px solid #374151' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', letterSpacing: 1 }}>PHASE {phase}</span>
              <span style={{ fontSize: 11, color: '#6b7280', background: '#111827', borderRadius: 4, padding: '2px 8px' }}>{formatSeconds(duration)}</span>
            </div>

            {/* Time axis */}
            <div style={{ display: 'flex', marginLeft: LABEL_W, borderBottom: '1px solid #1f2937', position: 'relative', height: 20 }}>
              {ticks.map(t => (
                <div
                  key={t}
                  style={{
                    position: 'absolute',
                    left: `${(t / duration) * 100}%`,
                    top: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 9, color: '#4b5563', userSelect: 'none', marginTop: 4 }}>{formatSeconds(t)}</span>
                </div>
              ))}
            </div>

            {/* Boss row */}
            {phaseBossAbilities.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #374151', background: 'rgba(127,29,29,0.15)', minHeight: BOSS_ROW_H }}>
                <div style={{ width: LABEL_W, flexShrink: 0, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: 1, textTransform: 'uppercase' }}>Boss</span>
                </div>
                <div style={{ flex: 1, position: 'relative', height: BOSS_ROW_H }}>
                  {/* tick lines */}
                  {ticks.map(t => (
                    <div key={t} style={{ position: 'absolute', left: `${(t / duration) * 100}%`, top: 0, bottom: 0, width: 1, background: '#1f2937' }} />
                  ))}
                  {phaseBossAbilities.map(ability => {
                    const hidden = hiddenBossSpells.has(ability.spellId);
                    const info = spellIconMap[ability.spellId];
                    return (
                      <div
                        key={`${ability.spellId}-${ability.time}`}
                        title={`${info?.name ?? `Spell ${ability.spellId}`} — ${Math.round(ability.frequency * 100)}% of logs — ${formatSeconds(ability.time)}\nClick to toggle`}
                        onClick={() => toggleBossSpell(ability.spellId)}
                        style={{
                          position: 'absolute',
                          left: `${(ability.time / duration) * 100}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          cursor: 'pointer',
                          opacity: hidden ? 0.25 : 1,
                          transition: 'opacity 0.15s',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <div style={{ border: '2px solid #ef4444', borderRadius: 5, overflow: 'hidden' }}>
                          <SpellIcon spellId={ability.spellId} spellIconMap={spellIconMap} size={BOSS_ICON_SIZE} />
                        </div>
                        <span style={{ fontSize: 8, color: hidden ? '#4b5563' : '#f87171', whiteSpace: 'nowrap', maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatSeconds(ability.time)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Healer rows */}
            {players.map(player => {
              const playerEntries = phaseEntries.filter(e => e.playerName === player.name);
              if (playerEntries.length === 0) return null;
              const rowKey = `${phase}-${player.name}`;
              const specColor = SPEC_COLORS[player.spec] ?? '#9ca3af';
              return (
                <div
                  key={rowKey}
                  style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #1f2937', minHeight: ROW_H }}
                  onPointerMove={e => handleTimelinePointerMove(e, phase, player.name)}
                  onPointerUp={handlePointerUp}
                >
                  {/* Label */}
                  <div style={{ width: LABEL_W, flexShrink: 0, padding: '0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 14 }}>{SPEC_ICONS[player.spec] ?? '💊'}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{player.name}</div>
                        <div style={{ fontSize: 9, color: specColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{SPEC_LABELS[player.spec as HealerSpec] ?? player.spec}</div>
                      </div>
                    </div>
                  </div>

                  {/* Timeline area */}
                  <div
                    ref={el => { if (el) timelineAreaRefs.current.set(rowKey, el); }}
                    style={{ flex: 1, position: 'relative', height: ROW_H }}
                  >
                    {/* tick lines */}
                    {ticks.map(t => (
                      <div key={t} style={{ position: 'absolute', left: `${(t / duration) * 100}%`, top: 0, bottom: 0, width: 1, background: '#1f2937' }} />
                    ))}
                    {playerEntries.map(entry => (
                      <div
                        key={entry.id}
                        title={`${spellIconMap[entry.spellId]?.name ?? `Spell ${entry.spellId}`}\n${formatSeconds(entry.time)} — ${Math.round(entry.frequency * 100)}% of logs\nDrag to adjust`}
                        onPointerDown={e => handleIconPointerDown(e, entry, duration)}
                        style={{
                          position: 'absolute',
                          left: `${(entry.time / duration) * 100}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          cursor: 'grab',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        <div style={{ border: `2px solid ${specColor}`, borderRadius: 5, overflow: 'hidden' }}>
                          <SpellIcon spellId={entry.spellId} spellIconMap={spellIconMap} size={ICON_SIZE} />
                        </div>
                        <span style={{ fontSize: 8, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatSeconds(entry.time)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Boss toggle legend */}
      {bossAbilities.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#4b5563', marginRight: 4 }}>Boss abilities — click icon to toggle:</span>
          {[...new Map(bossAbilities.map(b => [b.spellId, b])).values()].map(ability => {
            const hidden = hiddenBossSpells.has(ability.spellId);
            const info = spellIconMap[ability.spellId];
            return (
              <button
                key={ability.spellId}
                onClick={() => toggleBossSpell(ability.spellId)}
                title={`${info?.name ?? ability.spellId} — toggle visibility`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: hidden ? '#1f2937' : '#374151',
                  border: `1px solid ${hidden ? '#374151' : '#ef4444'}`,
                  borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                  opacity: hidden ? 0.4 : 1, transition: 'all 0.15s',
                }}
              >
                <SpellIcon spellId={ability.spellId} spellIconMap={spellIconMap} size={16} />
                <span style={{ fontSize: 10, color: '#e5e7eb', whiteSpace: 'nowrap' }}>
                  {info?.name ?? `Spell ${ability.spellId}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
