# 网络剪贴板设计文档

## 1. 项目概述

### 目标
构建一个轻量级的网络剪贴板应用，支持跨平台实时同步文本内容。

### 核心需求
- 多系统多编码支持（UTF-8）
- 实时双向同步
- 文本块折叠/展开
- 简单密码保护
- 云服务器部署（CentOS/RHEL）

---

## 2. 技术架构

### 技术栈
- **后端**: Node.js 18+ + Express 4.x + Socket.io 4.x
- **前端**: 原生 HTML/CSS/JS + Socket.io-client
- **存储**: JSON 文件
- **部署**: Docker + Nginx（端口 3101）

### 架构图
```
┌─────────────┐         WebSocket          ┌──────────────┐
│  浏览器 A   │ ◄─────────────────────────► │              │
└─────────────┘                             │              │
                                            │  Node.js     │
┌─────────────┐         WebSocket          │  Server      │
│  浏览器 B   │ ◄─────────────────────────► │  (Express +  │
└─────────────┘                             │  Socket.io)  │
                                            │              │
┌─────────────┐         WebSocket          │              │
│  移动端 C   │ ◄─────────────────────────► │              │
└─────────────┘                             └──────┬───────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ clipboard.json│
                                            └──────────────┘
```

---

## 3. 数据模型

### 剪贴板条目结构
```json
{
  "version": 1,
  "items": [
    {
      "id": "uuid-v4",
      "content": "文本内容",
      "timestamp": 1711507069182
    }
  ]
}
```

### 字段说明
- `version`: 数据格式版本号
- `id`: 唯一标识符
- `content`: 文本内容（UTF-8，最大 100KB）
- `timestamp`: 创建时间戳
- 注：`collapsed` 状态仅存储在客户端 localStorage

---

## 4. API 设计

### HTTP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 返回前端页面 |
| POST | `/auth` | 密码验证，返回 JWT token |

### WebSocket 事件

**客户端 → 服务器**:
- `authenticate`: 携带 JWT token 进行身份验证
- `add_item`: 添加新条目
- `delete_item`: 删除条目
- `update_item`: 更新条目内容

**服务器 → 客户端**:
- `auth_success`: 认证成功
- `auth_failed`: 认证失败
- `sync_data`: 全量数据同步
- `item_added`: 新条目广播
- `item_deleted`: 删除广播
- `item_updated`: 更新广播
- `error`: 错误信息（速率限制、数据校验失败等）

---

## 5. 核心功能实现

### 5.1 实时同步机制
1. 客户端连接时进行 JWT 认证
2. 认证成功后，服务器推送完整数据
3. 任何客户端修改触发 Socket.io 广播
4. 其他客户端接收事件并更新 UI
5. 断线自动重连（Socket.io 内置）

### 5.2 多编码支持
- Node.js 默认 UTF-8
- 前端 `<meta charset="UTF-8">`
- JSON 文件使用 UTF-8 编码（fs.writeFile 指定）

### 5.3 文本块折叠
- 纯前端实现（CSS + JS）
- 超过 3 行自动折叠
- 点击展开/收起
- 折叠状态存储在 localStorage

### 5.4 密码保护与认证
- 环境变量 `CLIPBOARD_PASSWORD`
- POST `/auth` 验证密码，返回 JWT token
- WebSocket 连接时验证 token
- Token 有效期 7 天

### 5.5 数据持久化（原子写入）
```javascript
// 使用临时文件 + 原子重命名
const tmp = 'clipboard.json.tmp';
fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
fs.renameSync(tmp, 'clipboard.json');
```

### 5.6 错误处理
- 数据校验：内容长度、条目数量
- 文件损坏：自动从备份恢复
- 网络异常：客户端自动重连
- 速率限制：每秒最多 10 次操作

---

## 6. 文件结构

```
paste/
├── server/
│   ├── index.js           # Express + Socket.io 服务器
│   ├── storage.js         # 文件存储逻辑（原子写入）
│   ├── auth.js            # JWT 认证
│   └── rateLimit.js       # 速率限制
├── public/
│   ├── index.html         # 前端页面
│   ├── style.css          # 样式
│   └── app.js             # 前端逻辑
├── data/
│   ├── clipboard.json     # 数据文件
│   └── clipboard.json.bak # 自动备份
├── logs/                  # 日志目录
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── .dockerignore
├── package.json
├── .env                   # 环境变量
└── .env.example           # 环境变量示例
```

---

## 7. 部署方案

### 7.1 Docker 配置

**Dockerfile**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3101
CMD ["node", "server/index.js"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  clipboard:
    build: .
    ports:
      - "3101:3101"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - PORT=3101
      - CLIPBOARD_PASSWORD=${CLIPBOARD_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
```

### 7.2 Nginx 配置（HTTPS + WebSocket）
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # WebSocket 超时
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

### 7.3 部署步骤
```bash
# 1. 克隆代码到服务器
git clone <repo-url> /opt/clipboard
cd /opt/clipboard

# 2. 配置环境变量
cp .env.example .env
nano .env  # 设置 CLIPBOARD_PASSWORD 和 JWT_SECRET

# 3. 启动 Docker 容器
docker-compose up -d

# 4. 查看日志
docker-compose logs -f
```

---

## 8. 安全考虑

### 8.1 认证与授权
- JWT token 认证（7 天有效期）
- WebSocket 连接必须验证 token
- 密码使用环境变量，不硬编码

### 8.2 传输安全
- 强制 HTTPS（Nginx SSL 配置）
- WebSocket 使用 WSS 协议

### 8.3 输入验证
- 单个条目最大长度：100KB
- 总条目数量限制：1000 条
- 内容 XSS 过滤（前端转义）

### 8.4 速率限制
- 每个 IP 每秒最多 10 次操作
- 使用 express-rate-limit 中间件

### 8.5 安全头
- 使用 helmet.js 设置安全 HTTP 头
- CSP、X-Frame-Options 等

---

## 9. 性能优化

- Socket.io 自动压缩
- 原子写入防止文件损坏
- 客户端 localStorage 缓存折叠状态
- 条目超过 100 时前端分页显示

---

## 10. 错误处理与日志

### 10.1 错误类型
- 网络异常：自动重连
- 数据损坏：从 .bak 恢复
- 认证失败：返回 401
- 速率限制：返回 429

### 10.2 日志系统
- 使用 winston 记录日志
- 日志级别：error, warn, info
- 日志文件：logs/app.log
- 操作审计：记录所有修改操作

---

## 11. 依赖包清单

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.6.0",
    "jsonwebtoken": "^9.0.0",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.0.0",
    "winston": "^3.8.0",
    "uuid": "^9.0.0"
  }
}
```

---

## 12. 测试策略

### 手动测试
- 多浏览器同时连接测试同步
- 断网重连测试
- 特殊字符（emoji、中文、日文）测试
- 认证流程测试

### 压力测试
- 10 个并发连接
- 快速添加/删除条目
- 大文本内容（接近 100KB）

---

## 13. 实施优先级

### P0（MVP 必须）
- 基础 WebSocket 通信
- JWT 认证
- 原子文件写入
- 前端折叠功能

### P1（上线前完成）
- HTTPS 配置
- 速率限制
- 错误处理
- 日志系统

### P2（后续优化）
- 自动备份
- 监控告警
- 性能优化

---

## 14. 未来扩展（不在当前范围）

- 文件上传支持
- 历史记录
- 多剪贴板空间
- 端到端加密
