'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface ParseResult {
  success: boolean;
  rawText?: string;
  parsed?: {
    // Support both old and new format
    basics?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      location?: string;
      summary?: string;
      headline?: string;
    };
    // Direct fields for OpenResume format
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
    headline?: string;
    workExperiences?: Array<{
      title?: string;
      jobTitle?: string;
      company?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
      description?: string;
      bullets?: string[];
    }>;
    educations?: Array<{
      institution?: string;
      school?: string;
      degree?: string;
      fieldOfStudy?: string;
      field?: string;
      startDate?: string;
      endDate?: string;
      gpa?: string;
    }>;
    skills?: string[];
    links?: string[] | Array<{ type: string; url: string; label?: string }>;
    certifications?: Array<{
      name: string;
      issuer?: string;
      date?: string;
    }>;
    projects?: Array<{
      name?: string;
      title?: string;
      description?: string;
      url?: string;
      technologies?: string[];
    }>;
    confidence: number;
    parseMethod?: 'ai' | 'rule-based' | 'open-resume';
  };
  normalized?: Record<string, unknown>;
  debug?: {
    textItemCount?: number;
    lineCount?: number;
    sections?: string[];
    rawResume?: unknown;
  };
  error?: string;
  stack?: string;
}

type ParserType = 'old' | 'openresume';

export default function TestResumePage() {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [parserType, setParserType] = useState<ParserType>('openresume');
  const [debugMode, setDebugMode] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Choose endpoint based on parser type
      const endpoint =
        parserType === 'openresume'
          ? `/api/test-resume-openresume${debugMode ? '?debug=true' : ''}`
          : '/api/test-resume';

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      // OpenResume parser only works with PDFs, so text goes to old parser
      const response = await fetch('/api/test-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textInput }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to get value from either format
  const getValue = (parsed: ParseResult['parsed'], field: string): string | undefined => {
    if (!parsed) return undefined;
    // Try direct field first, then basics
    const directValue = (parsed as Record<string, unknown>)[field];
    if (directValue !== undefined) return String(directValue);
    const basicsValue = parsed.basics?.[field as keyof typeof parsed.basics];
    return basicsValue !== undefined ? String(basicsValue) : undefined;
  };

  const getParseMethod = (parsed: ParseResult['parsed']) => {
    return parsed?.parseMethod || 'unknown';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-3xl font-bold">Resume Parser Test Page</h1>
        <p className="mb-8 text-gray-600">
          Upload a resume to test the parsing functionality. Choose between the OpenResume parser
          (recommended, feature-scoring based) or the legacy parser.
        </p>

        {/* Parser Selection */}
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <span className="font-medium">Parser:</span>
              <Button
                variant={parserType === 'openresume' ? 'default' : 'outline'}
                onClick={() => setParserType('openresume')}
                className={parserType === 'openresume' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                🎯 OpenResume Parser
              </Button>
              <Button
                variant={parserType === 'old' ? 'default' : 'outline'}
                onClick={() => setParserType('old')}
              >
                📋 Legacy Parser
              </Button>
              {parserType === 'openresume' && (
                <label className="ml-4 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                    className="rounded"
                  />
                  Debug mode
                </label>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {parserType === 'openresume'
                ? '✨ OpenResume: Feature-scoring based parser from open-resume.com. Uses PDF position metadata for accurate extraction.'
                : '📋 Legacy: Rule-based parser with regex patterns.'}
            </p>
          </CardContent>
        </Card>

        {/* Input Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex gap-4">
              <Button
                variant={activeTab === 'upload' ? 'default' : 'outline'}
                onClick={() => setActiveTab('upload')}
              >
                Upload File
              </Button>
              <Button
                variant={activeTab === 'paste' ? 'default' : 'outline'}
                onClick={() => setActiveTab('paste')}
                disabled={parserType === 'openresume'}
                title={parserType === 'openresume' ? 'OpenResume parser requires PDF files' : ''}
              >
                Paste Text
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'upload' ? (
              <div className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                  <input
                    type="file"
                    accept={parserType === 'openresume' ? '.pdf' : '.pdf,.txt'}
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="text-gray-600">
                      {file ? (
                        <span className="font-medium text-green-600">{file.name}</span>
                      ) : (
                        <>
                          <p className="text-lg font-medium">Click to upload or drag and drop</p>
                          <p className="text-sm">
                            {parserType === 'openresume' ? 'PDF only' : 'PDF or TXT'} (max 5MB)
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
                <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
                  {loading ? 'Parsing...' : 'Parse Resume'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste resume text here..."
                  className="h-64 w-full rounded-lg border border-gray-300 p-4"
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim() || loading}
                  className="w-full"
                >
                  {loading ? 'Parsing...' : 'Parse Text'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {result && (
          <div className="space-y-8">
            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  {result.success ? (
                    <span className="text-green-600">✓ Parsing Successful</span>
                  ) : (
                    <span className="text-red-600">✗ Parsing Failed</span>
                  )}
                  {result.parsed && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm ${
                        getParseMethod(result.parsed) === 'open-resume'
                          ? 'bg-green-100 text-green-800'
                          : getParseMethod(result.parsed) === 'ai'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {getParseMethod(result.parsed) === 'open-resume'
                        ? '🎯 OpenResume'
                        : getParseMethod(result.parsed) === 'ai'
                          ? '🤖 AI'
                          : '📋 Rule-Based'}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              {result.error && (
                <CardContent>
                  <p className="text-red-600">{result.error}</p>
                  {result.stack && (
                    <pre className="mt-2 overflow-auto rounded bg-red-50 p-2 text-xs text-red-800">
                      {result.stack}
                    </pre>
                  )}
                </CardContent>
              )}
            </Card>

            {result.parsed && (
              <>
                {/* Confidence Score */}
                <Card>
                  <CardHeader>
                    <CardTitle>Confidence Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full transition-all ${
                            result.parsed.confidence >= 0.7
                              ? 'bg-green-500'
                              : result.parsed.confidence >= 0.4
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${result.parsed.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-lg font-bold">
                        {Math.round(result.parsed.confidence * 100)}%
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Debug Info (if available) */}
                {result.debug && (
                  <Card>
                    <CardHeader>
                      <CardTitle>🔍 Debug Info</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded bg-gray-100 p-3">
                          <p className="text-sm text-gray-600">Text Items</p>
                          <p className="text-2xl font-bold">{result.debug.textItemCount}</p>
                        </div>
                        <div className="rounded bg-gray-100 p-3">
                          <p className="text-sm text-gray-600">Lines</p>
                          <p className="text-2xl font-bold">{result.debug.lineCount}</p>
                        </div>
                        <div className="rounded bg-gray-100 p-3">
                          <p className="text-sm text-gray-600">Sections</p>
                          <p className="text-2xl font-bold">{result.debug.sections?.length}</p>
                        </div>
                      </div>
                      {result.debug.sections && (
                        <div className="mt-4">
                          <p className="mb-2 text-sm font-medium">Detected Sections:</p>
                          <div className="flex flex-wrap gap-2">
                            {result.debug.sections.map((section, idx) => (
                              <span
                                key={idx}
                                className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                              >
                                {section}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>👤 Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-sm text-gray-500">First Name</dt>
                        <dd className="font-medium">
                          {getValue(result.parsed, 'firstName') || '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Last Name</dt>
                        <dd className="font-medium">
                          {getValue(result.parsed, 'lastName') || '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Email</dt>
                        <dd className="font-medium">{getValue(result.parsed, 'email') || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Phone</dt>
                        <dd className="font-medium">{getValue(result.parsed, 'phone') || '-'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-sm text-gray-500">Location</dt>
                        <dd className="font-medium">
                          {getValue(result.parsed, 'location') || '-'}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-sm text-gray-500">Headline</dt>
                        <dd className="font-medium">
                          {getValue(result.parsed, 'headline') || '-'}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                {/* Summary */}
                {getValue(result.parsed, 'summary') && (
                  <Card>
                    <CardHeader>
                      <CardTitle>📝 Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700">
                        {getValue(result.parsed, 'summary') as string}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Skills */}
                {result.parsed.skills && result.parsed.skills.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>🛠️ Skills ({result.parsed.skills.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {result.parsed.skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                          >
                            {typeof skill === 'string' ? skill : JSON.stringify(skill)}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Work Experience */}
                {result.parsed.workExperiences && result.parsed.workExperiences.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        💼 Work Experience ({result.parsed.workExperiences.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {result.parsed.workExperiences.map((exp, idx) => (
                          <div key={idx} className="border-l-2 border-blue-500 pl-4">
                            <h4 className="font-semibold">
                              {exp.title || exp.jobTitle || 'Untitled'}
                            </h4>
                            <p className="text-gray-600">{exp.company}</p>
                            <p className="text-sm text-gray-500">
                              {exp.startDate || '?'} -{' '}
                              {exp.isCurrent ? 'Present' : exp.endDate || '?'}
                            </p>
                            {exp.location && (
                              <p className="text-sm text-gray-500">📍 {exp.location}</p>
                            )}
                            {exp.description && (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                                {exp.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Education */}
                {result.parsed.educations && result.parsed.educations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>🎓 Education ({result.parsed.educations.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {result.parsed.educations.map((edu, idx) => (
                          <div key={idx} className="border-l-2 border-green-500 pl-4">
                            <h4 className="font-semibold">
                              {edu.institution || edu.school || 'Unknown Institution'}
                            </h4>
                            <p className="text-gray-600">
                              {edu.degree}
                              {(edu.fieldOfStudy || edu.field) &&
                                ` in ${edu.fieldOfStudy || edu.field}`}
                            </p>
                            <p className="text-sm text-gray-500">
                              {edu.startDate || '?'} - {edu.endDate || '?'}
                            </p>
                            {edu.gpa && <p className="text-sm text-gray-500">GPA: {edu.gpa}</p>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Projects */}
                {result.parsed.projects && result.parsed.projects.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>🚀 Projects ({result.parsed.projects.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {result.parsed.projects.map((proj, idx) => (
                          <div key={idx} className="border-l-2 border-purple-500 pl-4">
                            <h4 className="font-semibold">
                              {proj.name || proj.title || 'Untitled'}
                            </h4>
                            {proj.description && (
                              <p className="whitespace-pre-wrap text-sm text-gray-700">
                                {proj.description}
                              </p>
                            )}
                            {proj.url && (
                              <a href={proj.url} className="text-sm text-blue-600 hover:underline">
                                {proj.url}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Links */}
                {result.parsed.links && result.parsed.links.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>🔗 Links ({result.parsed.links.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.parsed.links.map((link, idx) => {
                          const url = typeof link === 'string' ? link : link.url;
                          const label = typeof link === 'string' ? link : link.label || link.type;
                          return (
                            <li key={idx}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {label}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Certifications */}
                {result.parsed.certifications && result.parsed.certifications.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        📜 Certifications ({result.parsed.certifications.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.parsed.certifications.map((cert, idx) => (
                          <li key={idx} className="border-l-2 border-yellow-500 pl-4">
                            <p className="font-medium">{cert.name}</p>
                            {cert.issuer && <p className="text-sm text-gray-600">{cert.issuer}</p>}
                            {cert.date && <p className="text-sm text-gray-500">{cert.date}</p>}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Raw JSON */}
                <Card>
                  <CardHeader>
                    <CardTitle>📄 Raw JSON Output</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-4 text-xs">
                      {JSON.stringify(result.parsed, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
