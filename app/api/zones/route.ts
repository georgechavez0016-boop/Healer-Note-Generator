import { NextResponse } from 'next/server';
import { wclQuery } from '@/lib/wcl-client';

const ZONES_QUERY = `
  query Zones {
    worldData {
      zones {
        id
        name
        encounters {
          id
          name
        }
      }
    }
  }
`;

interface WclZone {
  id: number;
  name: string;
  encounters: { id: number; name: string }[];
}

interface ZonesResponse {
  worldData: { zones: WclZone[] };
}

export async function GET() {
  try {
    const data = await wclQuery<ZonesResponse>(ZONES_QUERY);
    // Return most-recent zones first (WCL returns oldest first)
    const zones = [...data.worldData.zones].reverse();
    return NextResponse.json(zones);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
