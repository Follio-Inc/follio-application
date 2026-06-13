const fs = require('fs');
const path = require('path');
const https = require('https');

const CHROMIUM_VERSION = '147.0.0';
const architectures = ['x64', 'arm64'];
const destDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      console.log(`Chromium pack already exists at ${destPath}, skipping.`);
      return resolve();
    }

    console.log(`Downloading Chromium pack from ${url} to ${destPath}...`);
    const file = fs.createWriteStream(destPath);

    function get(downloadUrl) {
      https
        .get(downloadUrl, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            get(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            file.close();
            try {
              fs.unlinkSync(destPath);
            } catch (_) {}
            reject(
              new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`)
            );
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log(`Download completed: ${destPath}`);
            resolve();
          });
        })
        .on('error', (err) => {
          file.close();
          try {
            fs.unlinkSync(destPath);
          } catch (_) {}
          reject(err);
        });
    }

    get(url);
  });
}

async function main() {
  try {
    for (const arch of architectures) {
      const filename = `chromium-v${CHROMIUM_VERSION}-pack.${arch}.tar`;
      const url = `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/${filename}`;
      const destPath = path.join(destDir, filename);
      await downloadFile(url, destPath);
    }
    console.log('All Chromium packs downloaded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error downloading Chromium packs:', error);
    process.exit(1);
  }
}

main();
