const fs = require('fs');
const path = require('path');
const https = require('https');

const CHROMIUM_VERSION = '147.0.0';
const arch = 'x64'; // Vercel environments always run on x64 Linux
const filename = `chromium-v${CHROMIUM_VERSION}-pack.${arch}.tar`;
const url = `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/${filename}`;
const destDir = path.join(__dirname, '..', 'public');
const destPath = path.join(destDir, filename);

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(destPath)) {
  console.log(`Chromium pack already exists at ${destPath}, skipping download.`);
  process.exit(0);
}

console.log(`Downloading Chromium pack from ${url}...`);

const file = fs.createWriteStream(destPath);

function download(downloadUrl) {
  https
    .get(downloadUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        download(response.headers.location);
        return;
      }

      if (response.statusCode !== 200) {
        console.error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`);
        process.exit(1);
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('Download completed successfully.');
      });
    })
    .on('error', (err) => {
      try {
        fs.unlinkSync(destPath);
      } catch (_) {}
      console.error(`Error downloading file: ${err.message}`);
      process.exit(1);
    });
}

download(url);
