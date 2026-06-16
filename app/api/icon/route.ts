import { NextRequest, NextResponse } from 'next/server';
import { SPELL_ICONS } from '@/lib/cooldowns';

// Proxy WoW spell icons server-side to avoid any browser CSP/CORS restrictions.
// For healer CDs we use the hardcoded slug map; for anything else we try the
// WarcraftLogs CDN by spell ID as a best-effort fallback.
export async function GET(req: NextRequest) {
  const spellId = Number(req.nextUrl.searchParams.get('id'));
  if (!spellId) return new NextResponse(null, { status: 400 });

  const slug = SPELL_ICONS[spellId];
  const urls = [
    slug ? `https://wow.zamimg.com/images/wow/icons/medium/${slug}.jpg` : null,
    `https://assets.rpglogs.com/img/warcraft/abilities/${spellId}.jpg`,
  ].filter((u): u is string => u !== null);

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'healer-note-gen/1.0' } });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
          'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        },
      });
    } catch {
      continue;
    }
  }

  return new NextResponse(null, { status: 404 });
}
