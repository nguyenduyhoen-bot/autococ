const express = require('express');
const cors = require('cors');

class LocalBridgeServer {
  constructor(port = 48123) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.state = {
      isLicensed: false,
      licenseKey: null,
      plan: 'pro',
      allowedExtensions: ['cat-prime', 'cat-af'],
      aiConfig: {
        apiKey: '',
        modelName: 'gemini-1.5-flash',
        temperature: 0.7,
        responseLanguage: 'vi',
        customPrompt: 'Bạn là trợ lý AI chuyên nghiệp cho Adobe Premiere Pro & After Effects.'
      }
    };

    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CAT-Bridge-Request']
    }));

    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'CAT Manager Local Bridge', port: this.port });
    });

    // License Status for CEP extensions
    this.app.get('/api/status', (req, res) => {
      res.json({
        success: true,
        bridgeRunning: true,
        licensed: this.state.isLicensed,
        licenseKey: this.state.licenseKey,
        plan: this.state.plan,
        allowedExtensions: this.state.allowedExtensions
      });
    });

    // AI Configuration for CEP extensions
    this.app.get('/api/ai-config', (req, res) => {
      res.json({
        success: true,
        config: {
          apiKey: this.state.aiConfig.apiKey,
          modelName: this.state.aiConfig.modelName || 'gemini-1.5-flash',
          temperature: this.state.aiConfig.temperature || 0.7,
          responseLanguage: this.state.aiConfig.responseLanguage || 'vi',
          customPrompt: this.state.aiConfig.customPrompt
        }
      });
    });

    // Telemetry log from CEP
    this.app.post('/api/log-event', (req, res) => {
      const { source, action, details } = req.body;
      console.log(`[CEP LOG][${source || 'ADOBE'}] ${action}:`, details);
      res.json({ success: true });
    });
  }

  updateState(newState) {
    this.state = {
      ...this.state,
      ...newState,
      aiConfig: {
        ...this.state.aiConfig,
        ...(newState.aiConfig || {})
      }
    };
  }

  start() {
    return new Promise((resolve) => {
      try {
        this.server = this.app.listen(this.port, '127.0.0.1', () => {
          console.log(`🔌 CAT Manager Local Loopback Bridge listening on http://127.0.0.1:${this.port}`);
          resolve(true);
        });

        this.server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Bridge port ${this.port} is already in use, continuing...`);
            resolve(false);
          } else {
            console.error('Bridge server error:', err.message);
            resolve(false);
          }
        });
      } catch (err) {
        console.error('Failed to start bridge:', err.message);
        resolve(false);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = LocalBridgeServer;

