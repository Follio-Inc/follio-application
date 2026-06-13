import { getDisplayHost } from '@/lib/url';
import { getPublicProfile } from '@/services/profile.service';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;

  let profile;
  try {
    profile = await getPublicProfile(handle);
  } catch {
    profile = null;
  }

  if (!profile) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontSize: 48,
        }}
      >
        Profile Not Found
      </div>,
      { ...size }
    );
  }

  const fullName =
    [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') ||
    'Unknown';
  const headline = profile.headline || 'Professional Portfolio';
  const summary = profile.summary
    ? profile.summary.length > 140
      ? profile.summary.slice(0, 140) + '...'
      : profile.summary
    : null;

  const topSkills = profile.skills.slice(0, 5).map((s) => s.name);

  const latestWork = profile.workExperiences[0];
  const currentRole = latestWork ? `${latestWork.role} at ${latestWork.company}` : null;

  const latestEdu = profile.educations[0];
  const education = latestEdu
    ? [latestEdu.degree, latestEdu.institution].filter(Boolean).join(' - ')
    : null;

  const initial = (profile.firstName?.[0] || '?').toUpperCase();

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          width: '100%',
          height: 6,
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <div style={{ flex: 1, backgroundColor: '#3b82f6', display: 'flex' }} />
        <div style={{ flex: 1, backgroundColor: '#8b5cf6', display: 'flex' }} />
        <div style={{ flex: 1, backgroundColor: '#ec4899', display: 'flex' }} />
      </div>

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '48px 56px 24px',
        }}
      >
        {/* Avatar + Name row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          {/* Avatar circle with initial */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
              marginRight: 24,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: '#f8fafc',
                lineHeight: 1.1,
              }}
            >
              {fullName}
            </div>
            <div
              style={{
                fontSize: 20,
                color: '#94a3b8',
                marginTop: 4,
              }}
            >
              {headline}
            </div>
          </div>
        </div>

        {/* Details rows */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 16,
          }}
        >
          {profile.location ? (
            <div
              style={{
                fontSize: 16,
                color: '#64748b',
                display: 'flex',
                marginBottom: 6,
              }}
            >
              Location: {profile.location}
            </div>
          ) : null}

          {currentRole ? (
            <div
              style={{
                fontSize: 18,
                color: '#cbd5e1',
                display: 'flex',
                marginBottom: 6,
              }}
            >
              {currentRole}
            </div>
          ) : null}

          {education ? (
            <div
              style={{
                fontSize: 16,
                color: '#94a3b8',
                display: 'flex',
                marginBottom: 6,
              }}
            >
              {education}
            </div>
          ) : null}
        </div>

        {/* Summary */}
        {summary ? (
          <div
            style={{
              fontSize: 16,
              color: '#94a3b8',
              lineHeight: 1.5,
              marginBottom: 16,
              display: 'flex',
            }}
          >
            {summary}
          </div>
        ) : null}

        {/* Skills row */}
        {topSkills.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 'auto',
            }}
          >
            {topSkills.map((skill) => (
              <div
                key={skill}
                style={{
                  backgroundColor: 'rgba(59,130,246,0.2)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 14,
                  color: '#93c5fd',
                  fontWeight: 500,
                  display: 'flex',
                }}
              >
                {skill}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 56px',
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', fontSize: 16 }}>
          <span style={{ fontWeight: 700, color: '#94a3b8' }}>Follio</span>
          <span style={{ color: '#64748b', marginLeft: 8 }}>Digital Resume Platform</span>
        </div>
        <div style={{ fontSize: 14, color: '#475569', display: 'flex' }}>
          {getDisplayHost(handle)}
        </div>
      </div>
    </div>,
    { ...size }
  );
}
