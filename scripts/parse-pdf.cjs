#!/usr/bin/env node
/**
 * Standalone PDF parser script
 * Runs in pure Node.js (no webpack) to avoid bundling issues
 * Reads PDF buffer from stdin, outputs JSON to stdout
 *
 * Uses pdf-parse v1.1.1 which has a simple function-based API
 */

// Read the PDF buffer from stdin
let chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', async () => {
  try {
    const buffer = Buffer.concat(chunks);

    // pdf-parse v1.x exports a simple function
    const pdfParse = require('pdf-parse');

    // Simple function call - pass buffer, get result
    const data = await pdfParse(buffer);

    // Output the result as JSON
    const result = {
      success: true,
      text: data.text,
      numPages: data.numpages,
      info: data.info,
    };

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    const result = {
      success: false,
      error: error.message,
      stack: error.stack,
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }
});
