/**
 * Step 1: Read PDF and extract text items with position metadata
 * Uses a child process to run pdf-parse in pure Node.js, bypassing webpack bundling issues
 */

import { spawn } from 'child_process';
import path from 'path';
import type { TextItems } from './types';

/**
 * Read PDF from buffer and extract text items with position metadata
 * Uses a child process to avoid webpack bundling issues with pdf-parse/pdfjs-dist
 */
export async function readPdfFromBuffer(buffer: Buffer): Promise<TextItems> {
  console.log('[PDF Parser] Starting PDF extraction via child process...');

  // Parse PDF using child process
  const rawText = await parsePdfViaChildProcess(buffer);

  console.log(`[PDF Parser] Raw text extracted, length: ${rawText.length}`);
  console.log('[PDF Parser] First 500 chars:', rawText.substring(0, 500));

  // Process the extracted text into TextItems with synthetic positions
  const textItems = processTextIntoItems(rawText);

  console.log(`[PDF Parser] Extracted ${textItems.length} text items from PDF`);

  return textItems;
}

/**
 * Run pdf-parse in a child process to bypass webpack bundling
 */
function parsePdfViaChildProcess(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'parse-pdf.cjs');

    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', () => {
      if (stderr) {
        console.error('[PDF Parser] stderr:', stderr);
      }

      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          resolve(result.text);
        } else {
          reject(new Error(result.error || 'PDF parsing failed'));
        }
      } catch {
        reject(new Error(`Failed to parse PDF result: ${stdout.substring(0, 500)}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn PDF parser: ${error.message}`));
    });

    // Send the PDF buffer to the child process
    child.stdin.write(buffer);
    child.stdin.end();
  });
}

/**
 * Convert raw text into TextItems with synthetic position data
 * This creates a reasonable approximation for the OpenResume algorithm
 */
function processTextIntoItems(text: string): TextItems {
  const textItems: TextItems = [];
  const lines = text.split('\n');

  let currentY = 800; // Start from top of page (PDF coordinates)
  const lineHeight = 15; // Approximate line height
  const defaultX = 50; // Default left margin

  for (const line of lines) {
    // Skip empty lines but track position
    if (line.trim() === '') {
      currentY -= lineHeight * 1.5; // Extra space for blank lines
      continue;
    }

    // Detect if this might be a section header (all caps or ends with colon)
    const isHeader =
      line.trim().toUpperCase() === line.trim() ||
      /^[A-Z][A-Za-z\s]+:$/.test(line.trim()) ||
      /^(EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|SUMMARY|OBJECTIVE|PROFILE|AWARDS|PUBLICATIONS|LANGUAGES|INTERESTS|VOLUNTEER|REFERENCES)$/i.test(
        line.trim()
      );

    // Detect if this might be a bullet point
    const bulletMatch = line.match(/^(\s*)([-•●○▪►]\s*|[0-9]+\.\s+|[a-z]\)\s+)(.*)$/);

    if (bulletMatch) {
      // Bullet point - indented
      const indent = bulletMatch[1].length * 5;
      const bulletChar = bulletMatch[2];
      const content = bulletMatch[3];

      // Add bullet character
      textItems.push({
        text: bulletChar,
        x: defaultX + indent,
        y: currentY,
        width: 10,
        height: 12,
        fontName: 'Regular',
        hasEOL: false,
      });

      // Add content
      if (content.trim()) {
        textItems.push({
          text: content.trim(),
          x: defaultX + indent + 15,
          y: currentY,
          width: content.length * 6,
          height: 12,
          fontName: 'Regular',
          hasEOL: true,
        });
      }
    } else if (isHeader) {
      // Section header - possibly bold, at default X
      textItems.push({
        text: line.trim(),
        x: defaultX,
        y: currentY,
        width: line.length * 8,
        height: 14,
        fontName: 'Bold',
        hasEOL: true,
      });
    } else {
      // Regular line - split by common delimiters for better parsing
      // Look for patterns like "Job Title | Company | Date"
      const pipeSegments = line.split(/\s*[|│]\s*/);

      if (pipeSegments.length > 1) {
        let x = defaultX;
        for (let i = 0; i < pipeSegments.length; i++) {
          const segment = pipeSegments[i].trim();
          if (segment) {
            textItems.push({
              text: segment,
              x: x,
              y: currentY,
              width: segment.length * 6,
              height: 12,
              fontName: i === 0 ? 'SemiBold' : 'Regular',
              hasEOL: i === pipeSegments.length - 1,
            });
            x += segment.length * 6 + 30;
          }
        }
      } else {
        // Simple text line
        textItems.push({
          text: line.trim(),
          x: defaultX,
          y: currentY,
          width: line.length * 6,
          height: 12,
          fontName: 'Regular',
          hasEOL: true,
        });
      }
    }

    currentY -= lineHeight;
  }

  return textItems.filter((item) => item.text.trim() !== '');
}

/**
 * Read PDF from URL - for consistency, but mainly used client-side
 */
export async function readPdfFromUrl(fileUrl: string): Promise<TextItems> {
  // Fetch the PDF as a buffer
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return readPdfFromBuffer(buffer);
}
