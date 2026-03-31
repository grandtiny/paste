let socket;
let token = localStorage.getItem('token');
let allItems = [];

async function login() {
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) throw new Error('密码错误');
    const { token: newToken } = await res.json();
    token = newToken;
    localStorage.setItem('token', token);
    initSocket();
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
}

function initSocket() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  socket = io({ auth: { token } });

  socket.on('auth_failed', () => {
    localStorage.removeItem('token');
    location.reload();
  });

  socket.on('sync_data', (data) => {
    allItems = data.items;
    renderItems(allItems);
  });

  socket.on('item_added', (item) => {
    allItems.push(item);
    renderItems(allItems);
  });

  socket.on('item_deleted', (id) => {
    allItems = allItems.filter(i => i.id !== id);
    renderItems(allItems);
  });

  socket.on('item_updated', ({ id, content, timestamp }) => {
    const item = allItems.find(i => i.id === id);
    if (item) {
      item.content = content;
      item.timestamp = timestamp;
      renderItems(allItems);
    }
  });

  socket.on('error', (msg) => alert('错误: ' + msg));
}

function addItem() {
  const content = document.getElementById('new-item').value.trim();
  if (!content) return;
  socket.emit('add_item', content);
  document.getElementById('new-item').value = '';
}

function deleteItem(id) {
  socket.emit('delete_item', id);
}

function toggleCollapse(id) {
  const el = document.getElementById('item-' + id).querySelector('.item-content');
  el.classList.toggle('collapsed');
  const state = JSON.parse(localStorage.getItem('collapsed') || '{}');
  state[id] = el.classList.contains('collapsed');
  localStorage.setItem('collapsed', JSON.stringify(state));
}

function renderItems(items) {
  document.getElementById('items').innerHTML = '';
  items.sort((a, b) => b.timestamp - a.timestamp).forEach(addItemToDOM);
}

function addItemToDOM(item) {
  const div = document.createElement('div');
  div.className = 'item';
  div.id = 'item-' + item.id;

  const collapsed = JSON.parse(localStorage.getItem('collapsed') || '{}')[item.id];
  const lines = item.content.split('\n').length;

  div.innerHTML = `
    <div class="item-content ${collapsed || lines > 3 ? 'collapsed' : ''}">${escapeHtml(item.content)}</div>
    <div class="item-actions">
      ${lines > 3 ? `<button class="toggle-btn" onclick="toggleCollapse('${item.id}')">展开/收起</button>` : ''}
      <button class="copy-btn" onclick="copyItem('${item.id}')">复制</button>
      <button class="delete-btn" onclick="deleteItem('${item.id}')">删除</button>
      <span class="item-time">${formatTime(item.timestamp)}</span>
    </div>
  `;
  document.getElementById('items').appendChild(div);
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function searchItems() {
  const query = document.getElementById('search').value.toLowerCase();
  const filtered = query ? allItems.filter(item => item.content.toLowerCase().includes(query)) : allItems;
  renderItems(filtered);
}

function clearSearch() {
  document.getElementById('search').value = '';
  renderItems(allItems);
}

function copyItem(id) {
  const item = allItems.find(i => i.id === id);
  if (item) {
    navigator.clipboard.writeText(item.content).then(() => {
      showToast('已复制到剪贴板');
    }).catch(() => {
      showToast('复制失败');
    });
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

if (token) initSocket();
