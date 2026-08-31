import 'dotenv/config';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDb,
  officials,
  mandates,
  ballots,
  votes,
} from '@elupedia/shared';
import { eq, isNull, desc, sql } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));

const interRegular = readFileSync(join(__dirname, 'fonts/Inter-Regular.ttf'));
const interSemiBold = readFileSync(join(__dirname, 'fonts/Inter-SemiBold.ttf'));
const interBold = readFileSync(join(__dirname, 'fonts/Inter-Bold.ttf'));

const WIDTH = 1200;
const HEIGHT = 630;

const fonts = [
  {
    name: 'Inter',
    data: interRegular,
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Inter',
    data: interSemiBold,
    weight: 600 as const,
    style: 'normal' as const,
  },
  {
    name: 'Inter',
    data: interBold,
    weight: 700 as const,
    style: 'normal' as const,
  },
];

export type OfficialData = {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  politicalGroup: string | null;
  district: string | null;
  department: string | null;
  slug: string | null;
  mandateType: string;
};

export type VoteData = {
  id: string;
  title: string;
  date: string;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  absentCount: number;
};

function renderHeader(): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 32,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: 12 },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#4f46e5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 20,
                    fontWeight: 700,
                  },
                  children: 'E',
                },
              },
              {
                type: 'span',
                props: {
                  style: { fontSize: 28, fontWeight: 700, color: '#0f172a' },
                  children: 'Elupedia',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#15803d',
            },
            children: 'Donnée officielle horodatée',
          },
        },
      ],
    },
  };
}

function renderFooter(url: string, source: string): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 'auto',
        paddingTop: 24,
        borderTop: '1px solid #e2e8f0',
      },
      children: [
        {
          type: 'span',
          props: {
            style: { fontSize: 16, color: '#6366f1', fontWeight: 600 },
            children: url,
          },
        },
        {
          type: 'span',
          props: {
            style: { fontSize: 13, color: '#94a3b8' },
            children: `Source : ${source}`,
          },
        },
      ],
    },
  };
}

export function buildOfficialMarkup(data: OfficialData) {
  const fullName = `${data.firstName} ${data.lastName}`;
  const url = `elupedia.fr/elus/${data.slug ?? ''}`;
  const location = [data.district, data.department].filter(Boolean).join(' — ');
  const mandateLabel =
    data.mandateType === 'depute'
      ? 'Député·e'
      : data.mandateType === 'senateur'
        ? 'Sénateur·rice'
        : data.mandateType;
  const source =
    data.mandateType === 'depute' ? 'Assemblée nationale' : 'Sénat';

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: 48,
        background: 'white',
        fontFamily: 'Inter',
      },
      children: [
        renderHeader(),
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 40,
              flex: 1,
            },
            children: [
              data.photoUrl
                ? {
                    type: 'img',
                    props: {
                      src: data.photoUrl,
                      width: 180,
                      height: 180,
                      style: {
                        borderRadius: 20,
                        objectFit: 'cover',
                        border: '4px solid #818cf8',
                      },
                    },
                  }
                : {
                    type: 'div',
                    props: {
                      style: {
                        width: 180,
                        height: 180,
                        borderRadius: 20,
                        background: '#eef2ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 64,
                        fontWeight: 700,
                        color: '#4f46e5',
                        border: '4px solid #818cf8',
                      },
                      children: `${data.firstName[0]}${data.lastName[0]}`,
                    },
                  },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', gap: 12 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 44,
                          fontWeight: 700,
                          color: '#0f172a',
                          lineHeight: 1.1,
                        },
                        children: fullName,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 20,
                          color: '#64748b',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: {
                                background: '#eef2ff',
                                color: '#4338ca',
                                padding: '4px 12px',
                                borderRadius: 12,
                                fontWeight: 600,
                                fontSize: 16,
                              },
                              children: mandateLabel,
                            },
                          },
                          ...(data.politicalGroup
                            ? [
                                {
                                  type: 'span',
                                  props: {
                                    style: { color: '#94a3b8' },
                                    children: '·',
                                  },
                                },
                                {
                                  type: 'span',
                                  props: { children: data.politicalGroup },
                                },
                              ]
                            : []),
                        ],
                      },
                    },
                    ...(location
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: { fontSize: 18, color: '#94a3b8' },
                              children: location,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
            ],
          },
        },
        renderFooter(url, source),
      ],
    },
  };
}

export function buildVoteMarkup(data: VoteData) {
  const total =
    data.forCount + data.againstCount + data.abstainCount + data.absentCount;
  const adopted = data.forCount > data.againstCount;
  const dateFormatted = new Date(data.date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const bars = [
    { label: 'Pour', count: data.forCount, color: '#10b981' },
    { label: 'Contre', count: data.againstCount, color: '#ef4444' },
    { label: 'Abstention', count: data.abstainCount, color: '#f59e0b' },
    { label: 'Absent', count: data.absentCount, color: '#cbd5e1' },
  ];

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: 48,
        background: 'white',
        fontFamily: 'Inter',
      },
      children: [
        renderHeader(),
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              gap: 24,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12 },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: {
                          background: adopted ? '#f0fdf4' : '#fef2f2',
                          color: adopted ? '#15803d' : '#b91c1c',
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontWeight: 600,
                          fontSize: 16,
                        },
                        children: adopted ? 'Adopté' : 'Rejeté',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: 16, color: '#94a3b8' },
                        children: dateFormatted,
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#0f172a',
                    lineHeight: 1.3,
                    maxHeight: 130,
                    overflow: 'hidden',
                  },
                  children: data.title,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    width: '100%',
                    height: 20,
                    borderRadius: 10,
                    overflow: 'hidden',
                  },
                  children: bars
                    .filter((b) => b.count > 0)
                    .map((b) => ({
                      type: 'div',
                      props: {
                        style: {
                          width: `${(b.count / total) * 100}%`,
                          background: b.color,
                          height: '100%',
                        },
                      },
                    })),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: 24,
                    fontSize: 18,
                    color: '#475569',
                  },
                  children: bars.map((b) => ({
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: 8 },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              background: b.color,
                            },
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            children: `${b.label} ${b.count}`,
                          },
                        },
                      ],
                    },
                  })),
                },
              },
            ],
          },
        },
        renderFooter(`elupedia.fr/scrutins/${data.id}`, 'Assemblée nationale'),
      ],
    },
  };
}

export async function renderToPng(
  markup: Record<string, unknown>,
): Promise<Buffer> {
  const svg = await satori(markup as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function fetchRandomOfficial(): Promise<OfficialData> {
  const db = createDb();
  const [row] = await db
    .select({
      firstName: officials.firstName,
      lastName: officials.lastName,
      photoUrl: officials.photoUrl,
      politicalGroup: mandates.politicalGroup,
      district: mandates.district,
      department: mandates.department,
      slug: officials.slug,
      mandateType: mandates.type,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(isNull(mandates.endDate))
    .orderBy(sql`random()`)
    .limit(1);
  if (!row) throw new Error('No active official found');
  return row;
}

export async function fetchRecentVote(): Promise<VoteData> {
  const db = createDb();
  const [row] = await db
    .select({
      id: ballots.id,
      title: ballots.title,
      date: ballots.date,
      forCount: sql<number>`count(*) filter (where ${votes.position} = 'for')`,
      againstCount: sql<number>`count(*) filter (where ${votes.position} = 'against')`,
      abstainCount: sql<number>`count(*) filter (where ${votes.position} = 'abstain')`,
      absentCount: sql<number>`count(*) filter (where ${votes.position} = 'absent')`,
    })
    .from(ballots)
    .leftJoin(votes, eq(votes.ballotId, ballots.id))
    .groupBy(ballots.id, ballots.title, ballots.date)
    .orderBy(desc(ballots.date))
    .limit(1);
  if (!row) throw new Error('No ballot found');
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    forCount: Number(row.forCount),
    againstCount: Number(row.againstCount),
    abstainCount: Number(row.abstainCount),
    absentCount: Number(row.absentCount),
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'official' && mode !== 'vote') {
    console.error(
      'Usage: tsx scripts/generate-social-image.ts <official|vote> [output.png]',
    );
    process.exit(1);
  }

  const outPath = process.argv[3] ?? `social-${mode}.png`;

  let markup: Record<string, unknown>;
  if (mode === 'official') {
    const data = await fetchRandomOfficial();
    console.log(`Generating image for: ${data.firstName} ${data.lastName}`);
    markup = buildOfficialMarkup(data);
  } else {
    const data = await fetchRecentVote();
    console.log(`Generating image for vote: ${data.title}`);
    markup = buildVoteMarkup(data);
  }

  const png = await renderToPng(markup);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${(png.length / 1024).toFixed(0)} KB)`);
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
