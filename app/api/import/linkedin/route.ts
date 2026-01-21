import { auth } from '@clerk/nextjs/server';
import JSZip from 'jszip';
import { NextRequest, NextResponse } from 'next/server';

import type {
  NormalizedCertification,
  NormalizedEducation,
  NormalizedExperience,
  NormalizedProfileData,
  NormalizedSkill,
} from '@/services/import/types';
import { extractTextFromPDF, parseResumeText } from '@/services/resume-parser.service';

interface LinkedInPosition {
  'Company Name'?: string;
  Title?: string;
  Description?: string;
  Location?: string;
  'Started On'?: string;
  'Finished On'?: string;
}

interface LinkedInEducation {
  'School Name'?: string;
  'Degree Name'?: string;
  Notes?: string;
  'Start Date'?: string;
  'End Date'?: string;
}

interface LinkedInSkill {
  Name?: string;
}

interface LinkedInCertification {
  Name?: string;
  Authority?: string;
  'Started On'?: string;
  'Finished On'?: string;
  'License Number'?: string;
  Url?: string;
}

interface LinkedInProfile {
  'First Name'?: string;
  'Last Name'?: string;
  Headline?: string;
  Summary?: string;
  'Geo Location'?: string;
}

interface ParsedLinkedInData {
  profile: NormalizedProfileData;
  experiences: NormalizedExperience[];
  education: NormalizedEducation[];
  skills: NormalizedSkill[];
  certifications: NormalizedCertification[];
}

/**
 * Parse CSV content into array of objects
 */
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header row - handle quoted fields
  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const data: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }

  return data;
}

/**
 * Parse date string from LinkedIn format
 */
function parseLinkedInDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  // LinkedIn uses formats like "Jan 2020" or "2020"
  const monthMap: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };

  // Try "Mon YYYY" format
  const monthYearMatch = dateStr.match(/(\w{3})\s+(\d{4})/);
  if (monthYearMatch) {
    const month = monthMap[monthYearMatch[1]] || '01';
    return `${monthYearMatch[2]}-${month}-01`;
  }

  // Try just year
  const yearMatch = dateStr.match(/(\d{4})/);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }

  return undefined;
}

/**
 * Parse LinkedIn data export ZIP file
 */
async function parseLinkedInExport(buffer: Buffer): Promise<ParsedLinkedInData> {
  const zip = await JSZip.loadAsync(buffer);

  const result: ParsedLinkedInData = {
    profile: {},
    experiences: [],
    education: [],
    skills: [],
    certifications: [],
  };

  // Parse Profile.csv
  const profileFile = zip.file('Profile.csv');
  if (profileFile) {
    const content = await profileFile.async('text');
    const profiles = parseCSV(content) as unknown as LinkedInProfile[];
    if (profiles.length > 0) {
      const p = profiles[0];
      result.profile = {
        firstName: p['First Name'],
        lastName: p['Last Name'],
        headline: p['Headline'],
        summary: p['Summary'],
        location: p['Geo Location'],
      };
    }
  }

  // Parse Positions.csv (work experience)
  const positionsFile = zip.file('Positions.csv');
  if (positionsFile) {
    const content = await positionsFile.async('text');
    const positions = parseCSV(content) as unknown as LinkedInPosition[];
    result.experiences = positions
      .filter((p) => p['Company Name'])
      .map((p) => ({
        company: p['Company Name'] || '',
        role: p['Title'] || '',
        description: p['Description'],
        location: p['Location'],
        startDate: parseLinkedInDate(p['Started On']),
        endDate: parseLinkedInDate(p['Finished On']),
        isCurrent: !p['Finished On'],
        source: 'LINKEDIN' as const,
      }));
  }

  // Parse Education.csv
  const educationFile = zip.file('Education.csv');
  if (educationFile) {
    const content = await educationFile.async('text');
    const educations = parseCSV(content) as unknown as LinkedInEducation[];
    result.education = educations
      .filter((e) => e['School Name'])
      .map((e) => ({
        institution: e['School Name'] || '',
        degree: e['Degree Name'],
        fieldOfStudy: e['Notes'],
        startDate: parseLinkedInDate(e['Start Date']),
        endDate: parseLinkedInDate(e['End Date']),
        source: 'LINKEDIN' as const,
      }));
  }

  // Parse Skills.csv
  const skillsFile = zip.file('Skills.csv');
  if (skillsFile) {
    const content = await skillsFile.async('text');
    const skills = parseCSV(content) as unknown as LinkedInSkill[];
    result.skills = skills
      .filter((s) => s['Name'])
      .map((s) => ({
        name: s['Name'] || '',
        source: 'LINKEDIN' as const,
      }));
  }

  // Parse Certifications.csv
  const certificationsFile = zip.file('Certifications.csv');
  if (certificationsFile) {
    const content = await certificationsFile.async('text');
    const certs = parseCSV(content) as unknown as LinkedInCertification[];
    result.certifications = certs
      .filter((c) => c['Name'])
      .map((c) => ({
        name: c['Name'] || '',
        issuer: c['Authority'] || '',
        issueDate: parseLinkedInDate(c['Started On']),
        expirationDate: parseLinkedInDate(c['Finished On']),
        credentialId: c['License Number'],
        credentialUrl: c['Url'],
        source: 'LINKEDIN' as const,
      }));
  }

  return result;
}

/**
 * Parse LinkedIn PDF export
 * LinkedIn's "Save to PDF" creates a formatted PDF of the profile
 */
async function parseLinkedInPDF(buffer: Buffer): Promise<ParsedLinkedInData> {
  // Extract text from PDF using the resume parser's PDF extraction
  const text = await extractTextFromPDF(buffer);

  // Use the resume parser to extract structured data
  const parsedResume = parseResumeText(text);

  // Convert resume format to LinkedIn format
  const result: ParsedLinkedInData = {
    profile: {
      firstName: parsedResume.basics?.firstName,
      lastName: parsedResume.basics?.lastName,
      headline: parsedResume.basics?.headline,
      summary: parsedResume.basics?.summary,
      location: parsedResume.basics?.location,
    },
    experiences: (parsedResume.workExperiences || []).map((exp) => ({
      company: exp.company,
      role: exp.title,
      description: exp.description || exp.bullets?.join('\n'),
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.isCurrent || !exp.endDate,
      source: 'LINKEDIN' as const,
    })),
    education: (parsedResume.educations || []).map((edu) => ({
      institution: edu.institution,
      degree: edu.degree,
      fieldOfStudy: edu.fieldOfStudy,
      startDate: edu.startDate,
      endDate: edu.endDate,
      source: 'LINKEDIN' as const,
    })),
    skills: (parsedResume.skills || []).map((skill) => ({
      name: skill,
      source: 'LINKEDIN' as const,
    })),
    certifications: (parsedResume.certifications || []).map((cert) => ({
      name: cert.name,
      issuer: cert.issuer,
      issueDate: cert.date,
      source: 'LINKEDIN' as const,
    })),
  };

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'LinkedIn export file is required' }, { status: 400 });
    }

    const isPDF = file.name.endsWith('.pdf') || file.type === 'application/pdf';
    const isZIP = file.name.endsWith('.zip') || file.type === 'application/zip';

    // Validate file type
    if (!isPDF && !isZIP) {
      return NextResponse.json(
        { error: 'Please upload your LinkedIn profile as PDF or data export ZIP file' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB for ZIP, 10MB for PDF)
    const maxSize = isZIP ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size must be less than ${isZIP ? '50MB' : '10MB'}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse based on file type
    const parsed = isPDF ? await parseLinkedInPDF(buffer) : await parseLinkedInExport(buffer);

    // Calculate confidence based on what we found
    let confidence = 0;
    if (parsed.profile.firstName) confidence += 0.2;
    if (parsed.experiences.length > 0) confidence += 0.3;
    if (parsed.education.length > 0) confidence += 0.2;
    if (parsed.skills.length > 0) confidence += 0.2;
    if (parsed.certifications.length > 0) confidence += 0.1;

    return NextResponse.json({
      success: true,
      data: parsed,
      confidence,
      stats: {
        experiences: parsed.experiences.length,
        education: parsed.education.length,
        skills: parsed.skills.length,
        certifications: parsed.certifications.length,
      },
      message: `Imported ${parsed.experiences.length} experiences, ${parsed.education.length} education entries, ${parsed.skills.length} skills`,
    });
  } catch (error) {
    console.error('LinkedIn import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import LinkedIn data' },
      { status: 500 }
    );
  }
}
