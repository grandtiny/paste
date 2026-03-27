const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/clipboard.json');
const MAX_ITEMS = 1000;
const MAX_CONTENT_SIZE = 100 * 1024; // 100KB

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { version: 1, items: [] };
      saveData(initial);
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Load error:', err);
    return { version: 1, items: [] };
  }
}

function saveData(data) {
  if (data.items.length > MAX_ITEMS) {
    throw new Error(`Too many items (max ${MAX_ITEMS})`);
  }

  for (const item of data.items) {
    if (Buffer.byteLength(item.content, 'utf8') > MAX_CONTENT_SIZE) {
      throw new Error(`Content too large (max ${MAX_CONTENT_SIZE} bytes)`);
    }
  }

  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

module.exports = { loadData, saveData };
