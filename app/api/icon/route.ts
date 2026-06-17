import { NextRequest, NextResponse } from 'next/server';
import { SPELL_ICONS } from '@/lib/cooldowns';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
};

// In-memory cache so we don't hit Wowhead's tooltip API more than once per spell per process lifetime
const slugCache = new Map<number, string | null>();

async function fetchBinary(url: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'healer-note-gen/1.0' } });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return { buffer, contentType: res.headers.get('Content-Type') ?? 'image/jpeg' };
  } catch {
    return null;
  }
}

async function discoverSlugFromWowhead(spellId: number): Promise<string | null> {
  if (slugCache.has(spellId)) return slugCache.get(spellId) ?? null;
  try {
    const res = await fetch(`https://www.wowhead.com/tooltip/spell/${spellId}`, {
      headers: { 'User-Agent': 'healer-note-gen/1.0', Accept: 'application/json' },
    });
    if (!res.ok) { slugCache.set(spellId, null); return null; }
    const data = await res.json();
    const slug: string | null = data.icon ?? null;
    slugCache.set(spellId, slug);
    return slug;
  } catch {
    slugCache.set(spellId, null);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const spellId = Number(req.nextUrl.searchParams.get('id'));
  if (!spellId) return new NextResponse(null, { status: 400 });

  // 1. Hardcoded slug — fastest path for known healer CDs
  const hardcodedSlug = SPELL_ICONS[spellId];
  if (hardcodedSlug) {
    const result = await fetchBinary(
      `https://wow.zamimg.com/images/wow/icons/medium/${hardcodedSlug}.jpg`
    );
    if (result) return new NextResponse(result.buffer, { headers: { 'Content-Type': result.contentType, ...CACHE_HEADERS } });
  }

  // 2. WCL-provided slug passed as a hint (avoids Wowhead round-trip for boss spells)
  const hintSlug = req.nextUrl.searchParams.get('slug');
  if (hintSlug) {
    const slug = hintSlug.replace(/\.jpg$/i, ''); // strip extension if WCL included it
    const result = await fetchBinary(
      `https://wow.zamimg.com/images/wow/icons/medium/${slug}.jpg`
    );
    if (result) return new NextResponse(result.buffer, { headers: { 'Content-Type': result.contentType, ...CACHE_HEADERS } });
  }

  // 3. Wowhead tooltip API to discover the correct slug dynamically
  const discoveredSlug = await discoverSlugFromWowhead(spellId);
  if (discoveredSlug) {
    const result = await fetchBinary(
      `https://wow.zamimg.com/images/wow/icons/medium/${discoveredSlug}.jpg`
    );
    if (result) return new NextResponse(result.buffer, { headers: { 'Content-Type': result.contentType, ...CACHE_HEADERS } });
  }

  return new NextResponse(null, { status: 404 });
}
