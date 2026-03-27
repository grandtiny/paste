require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { loadData, saveData } = require('./storage');
const { verifyPassword, verifyToken } = require('./auth');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

let data = loadData();

app.post('/auth', (req, res) => {
  const token = verifyPassword(req.body.password);
  if (!token) return res.status(401).json({ error: 'Invalid password' });
  res.json({ token });
});

io.on('connection', (socket) => {
  const token = socket.handshake.auth.token;

  if (!verifyToken(token)) {
    socket.emit('auth_failed');
    socket.disconnect();
    return;
  }

  socket.emit('auth_success');
  socket.emit('sync_data', data);

  socket.on('add_item', (content) => {
    try {
      const item = { id: uuidv4(), content, timestamp: Date.now() };
      data.items.push(item);
      saveData(data);
      io.emit('item_added', item);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('delete_item', (id) => {
    try {
      data.items = data.items.filter(item => item.id !== id);
      saveData(data);
      io.emit('item_deleted', id);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('update_item', ({ id, content }) => {
    try {
      const item = data.items.find(i => i.id === id);
      if (item) {
        item.content = content;
        item.timestamp = Date.now();
        saveData(data);
        io.emit('item_updated', { id, content, timestamp: item.timestamp });
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });
});

const PORT = process.env.PORT || 3101;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
