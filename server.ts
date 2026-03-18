import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mineflayer = require('mineflayer');
console.log('Mineflayer initialized:', typeof mineflayer.createBot === 'function');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

app.use(cors());
app.use(express.json());

import Database from 'better-sqlite3';

const db = new Database('database.db');

// Initialize database
db.prepare('CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, config TEXT)').run();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleDatabaseError(error: any, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    timestamp: new Date().toISOString()
  };
  console.error('Database Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface BotModule {
  id: string;
  name: string;
  enabled: boolean;
  config?: any;
}

// Bot Manager
class BotInstance {
  bot: any;
  id: string;
  config: any;
  status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  logs: string[] = [];
  inventory: any[] = [];
  modules: BotModule[] = [
    { id: 'anti-afk', name: 'Anti-AFK', enabled: false },
    { id: 'auto-eat', name: 'Auto-Eat', enabled: false },
    { id: 'auto-reconnect', name: 'Auto-Reconnect', enabled: true },
    { id: 'skyblock-farm', name: 'Skyblock Farm', enabled: false },
    { id: 'auto-message', name: 'Auto-Message', enabled: false, config: { message: 'Hello from MineControl!', interval: 60000 } }
  ];
  stats: any = { health: 20, food: 20, position: { x: 0, y: 0, z: 0 }, oxygen: 20 };
  intervals: NodeJS.Timeout[] = [];
  reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(id: string, config: any, autoConnect = true) {
    this.id = id;
    this.config = config;
    if (config.modules && Array.isArray(config.modules)) {
      // Merge existing modules with defaults
      this.modules = this.modules.map(defaultMod => {
        const existing = config.modules.find((m: any) => m.id === defaultMod.id);
        return existing ? { ...defaultMod, ...existing } : defaultMod;
      });
    }
    if (autoConnect) {
      this.connect();
    }
  }

  connect() {
    this.stop(false); // Stop existing without clearing logs
    this.status = 'connecting';
    this.addLog(`Connecting to ${this.config.host}:${this.config.port || 25565}...`);

    try {
      this.bot = mineflayer.createBot({
        host: this.config.host,
        port: parseInt(this.config.port) || 25565,
        username: this.config.username,
        version: this.config.version || '1.21.8',
        auth: this.config.auth || 'offline',
        password: this.config.password,
        hideErrors: true
      });

      this.setupEvents();
    } catch (err: any) {
      this.status = 'error';
      this.addLog(`Failed to initialize bot: ${err.message}`);
    }
  }

  setupEvents() {
    if (!this.bot) {
      this.status = 'error';
      this.addLog('Failed to create bot instance.');
      return;
    }
    this.status = 'connecting';
    this.addLog(`Connecting to ${this.config.host}:${this.config.port || 25565}...`);

    this.bot.on('spawn', () => {
      this.status = 'connected';
      this.addLog('Bot spawned in world.');
      try {
        this.bot.loadPlugin(pathfinder);
      } catch (e) {}
      
      this.updateInventory();
      this.updateStats();

      // Auto-login handling
      if (this.config.autoLoginPassword) {
        setTimeout(() => {
          if (this.status === 'connected') {
            this.bot.chat(`/login ${this.config.autoLoginPassword}`);
            this.addLog('Sent auto-login command.');
          }
        }, 3000);
      }

      // Auto-commands
      if (this.config.autoCommands && Array.isArray(this.config.autoCommands)) {
        this.config.autoCommands.forEach((cmd: string, index: number) => {
          setTimeout(() => {
            if (this.status === 'connected') {
              this.bot.chat(cmd);
              this.addLog(`Sent auto-command: ${cmd}`);
            }
          }, 5000 + (index * 2000));
        });
      }
    });

    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;
      this.addLog(`[Chat] ${username}: ${message}`);
      io.to(this.id).emit('bot:chat', { username, message });
    });

    this.bot.on('messagestr', (message, position, jsonMsg) => {
      const cleanMsg = message.trim();
      if (cleanMsg) {
        this.addLog(`[System] ${cleanMsg}`);
      }
    });

    this.bot.on('kicked', (reason) => {
      this.status = 'disconnected';
      this.addLog(`Kicked from server: ${reason}`);
    });

    this.bot.on('error', (err) => {
      this.status = 'error';
      this.addLog(`Error: ${err.message}`);
      console.error(`Bot ${this.id} error:`, err);
    });

    this.bot.on('end', (reason) => {
      this.status = 'disconnected';
      this.addLog(`Disconnected: ${reason}`);
      
      const autoReconnect = this.modules.find(m => m.id === 'auto-reconnect')?.enabled;
      if (autoReconnect && reason !== 'quit') {
        this.addLog('Auto-reconnecting in 10 seconds...');
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 10000);
      }
    });

    this.bot.on('health', () => {
      this.updateStats();
    });

    // Periodic updates
    const statusInterval = setInterval(() => {
      if (this.status === 'connected' && this.bot) {
        this.updateStats();
        this.updateInventory();
        this.handleModules();
      }
    }, 2000);
    this.intervals.push(statusInterval);

    this.bot.on('playerCollect', (collector, collected) => {
      if (this.bot.entity && collector === this.bot.entity) {
        this.updateInventory();
      }
    });

    this.bot.on('windowOpen', (window) => {
      this.updateInventory();
    });

    if (this.bot.inventory) {
      this.bot.inventory.on('updateSlot', (slot, oldItem, newItem) => {
        this.updateInventory();
      });
    }
  }

  handleModules() {
    if (this.status !== 'connected' || !this.bot) return;

    // Anti-AFK
    const antiAfk = this.modules.find(m => m.id === 'anti-afk');
    if (antiAfk?.enabled) {
      if (Math.random() < 0.1) {
        const yaw = this.bot.entity.yaw + (Math.random() - 0.5) * 0.5;
        const pitch = this.bot.entity.pitch + (Math.random() - 0.5) * 0.5;
        this.bot.look(yaw, pitch, false);
      }
      if (Math.random() < 0.05) {
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot.setControlState('jump', false), 200);
      }
      if (Math.random() < 0.02) {
        const dir = ['forward', 'back', 'left', 'right'][Math.floor(Math.random() * 4)];
        this.bot.setControlState(dir, true);
        setTimeout(() => this.bot.setControlState(dir, false), 500);
      }
    }

    // Auto-Eat
    const autoEat = this.modules.find(m => m.id === 'auto-eat');
    if (autoEat?.enabled && this.bot.food < 16) {
      const food = this.bot.inventory.items().find(i => 
        i.name.includes('apple') || 
        i.name.includes('bread') || 
        i.name.includes('steak') || 
        i.name.includes('cooked') ||
        i.name.includes('carrot') ||
        i.name.includes('potato')
      );
      if (food) {
        this.bot.equip(food, 'hand').then(() => {
          this.bot.consume().catch(() => {});
        }).catch(() => {});
      }
    }

    // Skyblock Farm (Basic Example: Periodic Command)
    const skyblockFarm = this.modules.find(m => m.id === 'skyblock-farm');
    if (skyblockFarm?.enabled) {
      if (Math.random() < 0.01) { // Roughly every 100 seconds
        this.bot.chat('/fix all');
        this.addLog('Skyblock Farm: Sent /fix all');
      }
      if (Math.random() < 0.005) {
        this.bot.chat('/sell all');
        this.addLog('Skyblock Farm: Sent /sell all');
      }
    }

    // Auto-Message
    const autoMsg = this.modules.find(m => m.id === 'auto-message');
    if (autoMsg?.enabled && autoMsg.config) {
      if (!autoMsg.config.lastSent) autoMsg.config.lastSent = 0;
      const now = Date.now();
      if (now - autoMsg.config.lastSent > (autoMsg.config.interval || 60000)) {
        this.bot.chat(autoMsg.config.message);
        this.addLog(`Auto-Message: Sent "${autoMsg.config.message}"`);
        autoMsg.config.lastSent = now;
      }
    }
  }

  updateStats() {
    if (!this.bot) return;
    this.stats = {
      health: this.bot.health || 20,
      food: this.bot.food || 20,
      oxygen: this.bot.oxygenLevel || 20,
      position: this.bot.entity ? {
        x: this.bot.entity.position.x,
        y: this.bot.entity.position.y,
        z: this.bot.entity.position.z
      } : (this.stats.position || { x: 0, y: 0, z: 0 })
    };
    io.to(this.id).emit('bot:status', this.stats);
  }

  updateInventory() {
    if (!this.bot || !this.bot.inventory) return;
    const items = this.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      slot: item.slot
    }));
    this.inventory = items;
    io.to(this.id).emit('bot:inventory', items);
  }

  stop(clearLogs = true) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    if (this.bot) {
      try {
        this.bot.quit('quit');
        this.bot.removeAllListeners();
      } catch (e) {}
      this.bot = null;
    }
    this.status = 'disconnected';
    if (clearLogs) {
      this.addLog('Bot stopped manually.');
    }
  }

  addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${msg}`;
    this.logs.push(log);
    if (this.logs.length > 100) this.logs.shift();
    io.to(this.id).emit('bot:log', log);
  }

  breakBlock(pos: any) {
    if (!this.bot) return;
    this.addLog(`Attempting to break block at ${JSON.stringify(pos)}`);
    // Basic implementation could go here
  }

  placeBlock(pos: any, face: any) {
    if (!this.bot) return;
    this.addLog(`Attempting to place block at ${JSON.stringify(pos)}`);
    // Basic implementation could go here
  }
}

const bots: Map<string, BotInstance> = new Map();

// Persistence
async function loadBots() {
  try {
    const rows = db.prepare('SELECT * FROM bots').all() as { id: string, config: string }[];
    rows.forEach((row) => {
      const config = JSON.parse(row.config);
      const id = row.id;
      // Don't auto-connect on startup, let user decide
      const bot = new BotInstance(id, config, false);
      bots.set(id, bot);
    });
    console.log(`Loaded ${bots.size} bots from SQLite`);
  } catch (err) {
    handleDatabaseError(err, OperationType.LIST, 'bots');
  }
}

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// API Routes
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/bots', authenticate, (req, res) => {
  const botList = Array.from(bots.values()).map(b => ({
    id: b.id,
    ...b.config,
    status: b.status
  }));
  res.json(botList);
});

app.post('/api/bots/connect', authenticate, async (req, res) => {
  const config = req.body;
  const id = Math.random().toString(36).substr(2, 9);
  
  try {
    db.prepare('INSERT INTO bots (id, config) VALUES (?, ?)').run(id, JSON.stringify(config));
    const bot = new BotInstance(id, config);
    bots.set(id, bot);
    res.json({ id });
  } catch (err) {
    handleDatabaseError(err, OperationType.CREATE, `bots/${id}`);
    res.status(500).json({ error: 'Failed to save bot config' });
  }
});

app.post('/api/bots/update/:id', authenticate, async (req, res) => {
  const config = req.body;
  const id = req.params.id;
  
  try {
    const row = db.prepare('SELECT config FROM bots WHERE id = ?').get(id) as { config: string } | undefined;
    if (row) {
      const currentConfig = JSON.parse(row.config);
      const newConfig = { ...currentConfig, ...config };
      db.prepare('UPDATE bots SET config = ? WHERE id = ?').run(JSON.stringify(newConfig), id);

      const bot = bots.get(id);
      if (bot) {
        const oldConfig = { ...bot.config };
        bot.config = newConfig;
        if (config.modules) bot.modules = config.modules;
        
        // If critical connection info changed, reconnect
        const criticalChanged = 
          oldConfig.host !== config.host || 
          oldConfig.port !== config.port || 
          oldConfig.username !== config.username ||
          oldConfig.version !== config.version ||
          oldConfig.auth !== config.auth;

        if (criticalChanged && bot.status !== 'disconnected') {
          bot.addLog('Critical configuration changed, reconnecting...');
          bot.connect();
        } else {
          bot.addLog('Configuration updated');
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, OperationType.UPDATE, `bots/${id}`);
    res.status(500).json({ error: 'Failed to update bot config' });
  }
});

app.post('/api/bots/reconnect/:id', authenticate, (req, res) => {
  const bot = bots.get(req.params.id);
  if (bot) {
    bot.connect();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Bot not found' });
  }
});

app.post('/api/bots/disconnect/:id', authenticate, async (req, res) => {
  const bot = bots.get(req.params.id);
  if (bot) {
    bot.stop();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Bot not found' });
  }
});

app.delete('/api/bots/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  const bot = bots.get(id);
  if (bot) bot.stop();
  
  try {
    db.prepare('DELETE FROM bots WHERE id = ?').run(id);
    bots.delete(id);
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, OperationType.DELETE, `bots/${id}`);
    res.status(500).json({ error: 'Failed to delete bot config' });
  }
});

app.post('/api/bots/modules/:id', authenticate, async (req, res) => {
  const { moduleId, enabled } = req.body;
  const bot = bots.get(req.params.id);
  if (bot) {
    const module = bot.modules.find(m => m.id === moduleId);
    if (module) {
      module.enabled = enabled;
      bot.addLog(`Module ${module.name} ${enabled ? 'enabled' : 'disabled'}`);
      
      // Persist module state
      try {
        const row = db.prepare('SELECT config FROM bots WHERE id = ?').get(bot.id) as { config: string } | undefined;
        if (row) {
          const currentConfig = JSON.parse(row.config);
          currentConfig.modules = bot.modules;
          db.prepare('UPDATE bots SET config = ? WHERE id = ?').run(JSON.stringify(currentConfig), bot.id);
        }
      } catch (e) {
        handleDatabaseError(e, OperationType.UPDATE, `bots/${bot.id}`);
      }
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Module not found' });
    }
  } else {
    res.status(404).json({ error: 'Bot not found' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  socket.on('join', (botId) => {
    socket.join(botId);
    const bot = bots.get(botId);
    if (bot) {
      socket.emit('bot:init', {
        logs: bot.logs,
        inventory: bot.inventory,
        status: bot.status,
        stats: bot.stats,
        modules: bot.modules
      });
    }
  });

  socket.on('bot:command', ({ botId, command }) => {
    const bot = bots.get(botId);
    if (bot && bot.status === 'connected') {
      bot.bot.chat(command);
    }
  });

  socket.on('bot:move', ({ botId, direction }) => {
    const bot = bots.get(botId);
    if (bot && bot.status === 'connected') {
      // Simple movement logic
      if (direction === 'forward') bot.bot.setControlState('forward', true);
      if (direction === 'back') bot.bot.setControlState('back', true);
      if (direction === 'left') bot.bot.setControlState('left', true);
      if (direction === 'right') bot.bot.setControlState('right', true);
      if (direction === 'jump') bot.bot.setControlState('jump', true);
      
      setTimeout(() => {
        bot.bot.clearControlStates();
      }, 500);
    }
  });

  socket.on('bot:action', ({ botId, action, data }) => {
    const bot = bots.get(botId);
    if (bot && bot.status === 'connected') {
      if (action === 'break') {
        bot.breakBlock(data.pos);
      } else if (action === 'place') {
        bot.placeBlock(data.pos, data.face);
      }
    }
  });
});

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await loadBots();
  });
}

startServer();
