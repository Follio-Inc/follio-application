const input = document.getElementById('apiBase');
const saved = document.getElementById('saved');

chrome.storage.sync.get({ apiBase: 'http://localhost:3000' }, (data) => {
  input.value = data.apiBase || 'http://localhost:3000';
});

document.getElementById('save').addEventListener('click', () => {
  const apiBase = String(input.value || '')
    .trim()
    .replace(/\/$/, '');
  chrome.storage.sync.set({ apiBase }, () => {
    saved.textContent = 'Saved.';
    setTimeout(() => {
      saved.textContent = '';
    }, 1500);
  });
});
