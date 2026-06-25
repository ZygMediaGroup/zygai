// Plugin Manager for ZygAI
// This system allows for extensible functionality through plugins

interface ZygAIPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  
  // Plugin initialization
  initialize?: (api: PluginAPI) => void;
  
  // Plugin cleanup
  cleanup?: () => void;
  
  // UI components (optional)
  getSidebarComponent?: () => React.ComponentType<any>;
  getChatComponent?: () => React.ComponentType<any>;
  getSettingsComponent?: () => React.ComponentType<any>;
  
  // Message processing hooks
  preProcessMessage?: (message: string) => string | Promise<string>;
  postProcessMessage?: (message: string) => string | Promise<string>;
  
  // Command handlers
  handleCommand?: (command: string, args: string[]) => string | Promise<string>;
}

interface PluginAPI {
  // Chat functionality
  sendMessage: (message: string) => void;
  getCurrentSession: () => any;
  
  // UI functionality
  showModal: (component: React.ReactNode, title: string) => void;
  hideModal: () => void;
  
  // Storage
  getStorage: (key: string) => any;
  setStorage: (key: string, value: any) => void;
  
  // Events
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
  
  // Logging
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

class PluginManager {
  private plugins: Map<string, ZygAIPlugin>;
  private api: PluginAPI;
  private eventListeners: Map<string, Set<Function>>;

  constructor() {
    this.plugins = new Map();
    this.eventListeners = new Map();
    
    // Initialize the API
    this.api = {
      sendMessage: this.handleSendMessage.bind(this),
      getCurrentSession: this.handleGetCurrentSession.bind(this),
      showModal: this.handleShowModal.bind(this),
      hideModal: this.handleHideModal.bind(this),
      getStorage: this.handleGetStorage.bind(this),
      setStorage: this.handleSetStorage.bind(this),
      on: this.handleOn.bind(this),
      off: this.handleOff.bind(this),
      emit: this.handleEmit.bind(this),
      log: this.handleLog.bind(this),
      error: this.handleError.bind(this)
    };
  }

  // Plugin management
  registerPlugin(plugin: ZygAIPlugin) {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} is already registered`);
      return;
    }
    
    this.plugins.set(plugin.id, plugin);
    
    // Initialize the plugin
    if (plugin.initialize) {
      try {
        plugin.initialize(this.api);
        console.log(`Plugin ${plugin.id} initialized successfully`);
      } catch (error) {
        console.error(`Failed to initialize plugin ${plugin.id}:`, error);
        this.plugins.delete(plugin.id);
      }
    }
  }

  unregisterPlugin(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    // Cleanup the plugin
    if (plugin.cleanup) {
      try {
        plugin.cleanup();
      } catch (error) {
        console.error(`Error cleaning up plugin ${pluginId}:`, error);
      }
    }
    
    this.plugins.delete(pluginId);
    console.log(`Plugin ${pluginId} unregistered`);
  }

  getPlugin(pluginId: string): ZygAIPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): ZygAIPlugin[] {
    return Array.from(this.plugins.values());
  }

  // Message processing pipeline
  async processMessageThroughPlugins(message: string): Promise<string> {
    let processedMessage = message;
    
    // Pre-process through all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.preProcessMessage) {
        try {
          const result = await plugin.preProcessMessage(processedMessage);
          if (typeof result === 'string') {
            processedMessage = result;
          }
        } catch (error) {
          console.error(`Error in plugin ${plugin.id} pre-processing:`, error);
        }
      }
    }
    
    return processedMessage;
  }

  async postProcessMessageThroughPlugins(message: string): Promise<string> {
    let processedMessage = message;
    
    // Post-process through all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.postProcessMessage) {
        try {
          const result = await plugin.postProcessMessage(processedMessage);
          if (typeof result === 'string') {
            processedMessage = result;
          }
        } catch (error) {
          console.error(`Error in plugin ${plugin.id} post-processing:`, error);
        }
      }
    }
    
    return processedMessage;
  }

  // Command handling
  async handleCommand(command: string, args: string[]): Promise<string | null> {
    for (const plugin of this.plugins.values()) {
      if (plugin.handleCommand) {
        try {
          const result = await plugin.handleCommand(command, args);
          if (result) {
            return result;
          }
        } catch (error) {
          console.error(`Error in plugin ${plugin.id} command handling:`, error);
        }
      }
    }
    return null;
  }

  // Event handling
  private handleOn(event: string, callback: (...args: any[]) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)?.add(callback);
  }

  private handleOff(event: string, callback: (...args: any[]) => void) {
    this.eventListeners.get(event)?.delete(callback);
  }

  private handleEmit(event: string, ...args: any[]) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Placeholder implementations for API methods
  // These would be connected to the actual app functionality
  private handleSendMessage(message: string) {
    console.log('Sending message:', message);
    this.handleEmit('messageSent', message);
  }

  private handleGetCurrentSession() {
    return {}; // Return actual session data
  }

  private handleShowModal(component: React.ReactNode, title: string) {
    console.log('Showing modal:', title, component);
  }

  private handleHideModal() {
    console.log('Hiding modal');
  }

  private handleGetStorage(key: string) {
    return localStorage.getItem(key);
  }

  private handleSetStorage(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  private handleLog(...args: any[]) {
    console.log('[Plugin]', ...args);
  }

  private handleError(...args: any[]) {
    console.error('[Plugin Error]', ...args);
  }
}

// Singleton instance
export const pluginManager = new PluginManager();

// Type extensions for React
declare module 'react' {
  interface HTMLAttributes<T> {
    'data-plugin-id'?: string;
  }
}