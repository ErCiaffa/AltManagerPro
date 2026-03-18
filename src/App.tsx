import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bot, 
  Terminal, 
  Settings, 
  Plus, 
  Power, 
  MessageSquare, 
  Package, 
  Navigation, 
  Shield, 
  LogOut,
  ChevronRight,
  Activity,
  User,
  Server,
  Lock,
  RefreshCw
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// Simple Routing
type View = 'login' | 'dashboard' | 'bot-control' | 'add-bot';

export default function App() {
  const [view, setView] = useState<View>('login');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [editingBot, setEditingBot] = useState<any>(null);

  useEffect(() => {
    if (token) {
      setView('dashboard');
    } else {
      setView('login');
    }
  }, [token]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setView('login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      <AnimatePresence mode="wait">
        {view === 'login' && (
          <Login key="login" onLogin={handleLogin} />
        )}
        {view === 'dashboard' && (
          <Dashboard 
            key="dashboard" 
            token={token!} 
            onLogout={handleLogout} 
            onSelectBot={(id: string) => { setSelectedBotId(id); setView('bot-control'); }}
            onAddBot={() => { setEditingBot(null); setView('add-bot'); }}
            onEditBot={(bot: any) => { setEditingBot(bot); setView('add-bot'); }}
          />
        )}
        {view === 'bot-control' && selectedBotId && (
          <BotControl 
            key="bot-control" 
            botId={selectedBotId} 
            token={token!}
            onBack={() => setView('dashboard')} 
          />
        )}
        {view === 'add-bot' && (
          <AddBot 
            key="add-bot" 
            token={token!} 
            editingBot={editingBot}
            onBack={() => setView('dashboard')} 
            onSuccess={() => setView('dashboard')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Components ---

function Login({ onLogin }: { onLogin: (token: string) => void, key?: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-4"
    >
      <div className="w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <Shield className="w-12 h-12 text-emerald-500" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-center mb-2">MineControl Pro</h1>
        <p className="text-gray-400 text-center mb-8">Admin Authentication Required</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Admin Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          
          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Enter Dashboard'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function Dashboard({ token, onLogout, onSelectBot, onAddBot, onEditBot }: any) {
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const res = await fetch('/api/bots', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setBots(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteBot = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/bots/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchBots();
    } catch (err) {
      console.error(err);
    }
  };

  const reconnectBot = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/bots/reconnect/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchBots();
    } catch (err) {
      console.error(err);
    }
  };

  const disconnectBot = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/bots/disconnect/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchBots();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-6 lg:p-12 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-bold mb-2 tracking-tight">Bot Dashboard</h1>
          <p className="text-gray-400">Manage your active Minecraft bot sessions</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onAddBot}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" /> New Bot
          </button>
          <button 
            onClick={onLogout}
            className="bg-white/5 hover:bg-white/10 text-white px-4 py-3 rounded-xl transition-all border border-white/10"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-10 h-10 animate-spin text-emerald-500" />
        </div>
      ) : bots.length === 0 ? (
        <div className="bg-[#141414] border border-dashed border-white/10 rounded-3xl p-20 text-center">
          <Bot className="w-16 h-16 text-gray-600 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">No active bots</h2>
          <p className="text-gray-400 mb-8">Create your first bot session to start farming</p>
          <button 
            onClick={onAddBot}
            className="text-emerald-500 font-bold hover:underline"
          >
            Add a bot now &rarr;
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots.map((bot) => (
            <motion.div 
              key={bot.id}
              whileHover={{ y: -5 }}
              className="bg-[#141414] border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-emerald-500/50 transition-all group relative"
              onClick={() => onSelectBot(bot.id)}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <Bot className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEditBot(bot); }}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                    title="Edit Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {bot.status === 'connected' ? (
                    <button 
                      onClick={(e) => disconnectBot(e, bot.id)}
                      className="p-2 hover:bg-yellow-500/10 rounded-lg text-gray-500 hover:text-yellow-500 transition-colors"
                      title="Disconnect Bot"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  ) : (
                    <button 
                      onClick={(e) => reconnectBot(e, bot.id)}
                      className="p-2 hover:bg-emerald-500/10 rounded-lg text-gray-500 hover:text-emerald-500 transition-colors"
                      title="Connect Bot"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={(e) => deleteBot(e, bot.id)}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                    title="Delete Bot Profile"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    bot.status === 'connected' ? 'bg-emerald-500/20 text-emerald-500' : 
                    bot.status === 'connecting' ? 'bg-yellow-500/20 text-yellow-500' : 
                    'bg-red-500/20 text-red-500'
                  }`}>
                    {bot.status}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-1">{bot.username}</h3>
              <p className="text-gray-400 text-sm mb-6 flex items-center gap-2">
                <Server className="w-4 h-4" /> {bot.host}
              </p>
              <div className="flex items-center justify-between pt-6 border-t border-white/5">
                <span className="text-xs text-gray-500 font-mono">{bot.id}</span>
                <div className="flex items-center gap-2">
                  {bot.status === 'disconnected' && (
                    <button 
                      onClick={(e) => reconnectBot(e, bot.id)}
                      className="text-xs text-emerald-500 hover:underline font-bold"
                    >
                      Reconnect
                    </button>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-emerald-500 transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function AddBot({ token, onBack, onSuccess, editingBot }: any) {
  const [formData, setFormData] = useState({
    host: editingBot?.host || '',
    port: editingBot?.port || '25565',
    username: editingBot?.username || '',
    version: editingBot?.version || '1.21.8',
    auth: editingBot?.auth || 'offline',
    password: editingBot?.password || '',
    autoLoginPassword: editingBot?.autoLoginPassword || '',
    autoReconnect: editingBot?.autoReconnect ?? true,
    stealth: editingBot?.stealth ?? true,
    autoCommands: editingBot?.autoCommands?.join('\n') || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingBot ? `/api/bots/update/${editingBot.id}` : '/api/bots/connect';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          autoCommands: formData.autoCommands.split('\n').filter(c => c.trim())
        })
      });
      if (res.ok) {
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 lg:p-12 max-w-3xl mx-auto"
    >
      <button onClick={onBack} className="text-gray-400 hover:text-white mb-8 flex items-center gap-2 transition-colors">
        &larr; Back to Dashboard
      </button>
      
      <div className="bg-[#141414] border border-white/10 rounded-3xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-8">Connect New Bot</h1>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Server Host</label>
              <input 
                type="text" 
                required
                value={formData.host}
                onChange={(e) => setFormData({...formData, host: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50"
                placeholder="play.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Port</label>
              <input 
                type="text" 
                value={formData.port}
                onChange={(e) => setFormData({...formData, port: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
              <input 
                type="text" 
                required
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50"
                placeholder="BotName"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Version</label>
              <select 
                value={formData.version}
                onChange={(e) => setFormData({...formData, version: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="1.21.8">1.21.8</option>
                <option value="1.21.7">1.21.7</option>
                <option value="1.21.1">1.21.1</option>
                <option value="1.20.1">1.20.1</option>
                <option value="1.19.4">1.19.4</option>
              </select>
            </div>
          </div>

          <div className="space-y-6 pt-6 border-t border-white/5">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" /> Automation & Stealth
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Auto-Login Password (optional)</label>
                <input 
                  type="password" 
                  value={formData.autoLoginPassword}
                  onChange={(e) => setFormData({...formData, autoLoginPassword: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50"
                  placeholder="/login password"
                />
              </div>
              <div className="flex items-center gap-3 pt-8">
                <input 
                  type="checkbox" 
                  checked={formData.autoReconnect}
                  onChange={(e) => setFormData({...formData, autoReconnect: e.target.checked})}
                  className="w-5 h-5 accent-emerald-500"
                />
                <label className="text-sm font-medium text-gray-400">Auto Reconnect</label>
              </div>
              <div className="flex items-center gap-3 pt-8">
                <input 
                  type="checkbox" 
                  checked={formData.stealth}
                  onChange={(e) => setFormData({...formData, stealth: e.target.checked})}
                  className="w-5 h-5 accent-emerald-500"
                />
                <label className="text-sm font-medium text-gray-400">Stealth Mode</label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Auto Commands (one per line)</label>
              <textarea 
                value={formData.autoCommands}
                onChange={(e) => setFormData({...formData, autoCommands: e.target.value})}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 h-32"
                placeholder="/home&#10;/warp farm"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Spawn Bot Instance'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function BotControl({ botId, onBack, token }: { botId: string, onBack: () => void, token: string, key?: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [status, setStatus] = useState<string>('connecting');
  const [modules, setModules] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [stats, setStats] = useState({ health: 20, food: 20, position: { x: 0, y: 0, z: 0 }, oxygen: 20 });

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.emit('join', botId);

    s.on('bot:init', (data) => {
      setLogs(data.logs);
      setInventory(data.inventory);
      setStatus(data.status);
      setStats(data.stats);
      setModules(data.modules);
    });

    s.on('bot:log', (log) => setLogs(prev => [...prev.slice(-99), log]));
    s.on('bot:inventory', (inv) => setInventory(inv));
    s.on('bot:status', (data) => setStats(data));
    s.on('bot:chat', (data) => {
      // Chat logs are already handled by bot:log on server
    });

    return () => { s.disconnect(); };
  }, [botId]);

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    try {
      await fetch(`/api/bots/modules/${botId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ moduleId, enabled })
      });
      setModules(prev => prev.map(m => m.id === moduleId ? { ...m, enabled } : m));
    } catch (err) {
      console.error(err);
    }
  };

  const disconnectBot = async () => {
    try {
      await fetch(`/api/bots/disconnect/${botId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onBack();
    } catch (err) {
      console.error(err);
    }
  };

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket?.emit('bot:command', { botId, command: chatInput });
    setChatInput('');
  };

  const move = (direction: string) => {
    socket?.emit('bot:move', { botId, direction });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-screen"
    >
      {/* Header */}
      <header className="bg-[#141414] border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            &larr;
          </button>
          <div>
            <h2 className="font-bold flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-500" /> Session: {botId}
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" /> {status}
              </span>
              <span className="flex items-center gap-1">
                <Navigation className="w-3 h-3" /> {stats.position ? `${Math.round(stats.position.x)}, ${Math.round(stats.position.y)}, ${Math.round(stats.position.z)}` : '0, 0, 0'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={disconnectBot}
            className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
            title="Disconnect Bot"
          >
            <Power className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
            <Activity className="w-4 h-4 text-red-500" />
            <span className="text-sm font-bold text-red-500">{Math.round(stats.health)}</span>
          </div>
          <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20">
            <Package className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-orange-500">{Math.round(stats.food)}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Logs & Chat */}
        <div className="flex-1 flex flex-col border-r border-white/10">
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1 bg-[#0a0a0a]">
            {logs.map((log, i) => (
              <div key={i} className={log.includes('[Chat]') ? 'text-emerald-400' : 'text-gray-400'}>
                {log}
              </div>
            ))}
          </div>
          <form onSubmit={sendCommand} className="p-4 bg-[#141414] border-t border-white/10 flex gap-2">
            <input 
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500/50"
              placeholder="Send message or command..."
            />
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded-lg transition-colors">
              <MessageSquare className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Right: Inventory & Controls */}
        <div className="w-80 bg-[#141414] flex flex-col">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-500" /> Modules
            </h3>
            <div className="space-y-2">
              {modules.map(module => (
                <div key={module.id} className="flex items-center justify-between p-2 bg-[#0a0a0a] rounded-lg border border-white/5">
                  <span className="text-sm">{module.name}</span>
                  <button 
                    onClick={() => toggleModule(module.id, !module.enabled)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${module.enabled ? 'bg-emerald-600' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${module.enabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-b border-white/10">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-emerald-500" /> Inventory
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 36 }).map((_, i) => {
                const item = Array.isArray(inventory) ? inventory.find(it => it.slot === i + 9) : null;
                return (
                  <div key={i} className="aspect-square bg-[#0a0a0a] border border-white/5 rounded-lg flex items-center justify-center relative group">
                    {item && (
                      <>
                        <div className="text-xs text-emerald-500 font-bold">{item.name.substring(0, 2)}</div>
                        <span className="absolute bottom-0.5 right-1 text-[10px] font-bold">{item.count}</span>
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] p-1 text-center">
                          {item.name}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <Navigation className="w-4 h-4 text-emerald-500" /> Movement
            </h3>
            <div className="grid grid-cols-3 gap-2 max-w-[150px] mx-auto">
              <div />
              <button onMouseDown={() => move('forward')} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex justify-center">
                <ChevronRight className="w-5 h-5 -rotate-90" />
              </button>
              <div />
              <button onMouseDown={() => move('left')} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex justify-center">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <button onMouseDown={() => move('jump')} className="p-3 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl border border-emerald-500/30 flex justify-center">
                <Plus className="w-5 h-5" />
              </button>
              <button onMouseDown={() => move('right')} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex justify-center">
                <ChevronRight className="w-5 h-5" />
              </button>
              <div />
              <button onMouseDown={() => move('back')} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex justify-center">
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
              <div />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
