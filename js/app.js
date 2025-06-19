// Import all modules
import { AIModels } from './models.js';
import { ChatManager } from './chat.js';
import { ScenarioManager } from './scenarios.js';
import { DebugManager } from './debug.js';
import { SettingsManager } from './settings.js';

window.situatorApp = function() {
    const app = {
        // View state
        currentView: 'simulator',
        processing: false,
        showScenarioPrompt: false,
        
        // Provider settings
        selectedProvider: localStorage.getItem('selected_provider') || 'openai',
        
        // OpenAI settings
        openaiKey: localStorage.getItem('openai_api_key') || '',
        openaiModel: localStorage.getItem('openai_model') || 'gpt-4.1-nano',
        
        // Anthropic settings
        anthropicKey: localStorage.getItem('anthropic_api_key') || '',
        anthropicModel: localStorage.getItem('anthropic_model') || 'claude-sonnet-4-20250514',
        
        // Google settings
        googleKey: localStorage.getItem('google_api_key') || '',
        googleModel: localStorage.getItem('google_model') || 'gemini-2.5-flash',
        
        // xAI settings
        xaiKey: localStorage.getItem('xai_api_key') || '',
        xaiModel: localStorage.getItem('xai_model') || 'grok-3',
        
        // DeepSeek settings
        deepseekKey: localStorage.getItem('deepseek_api_key') || '',
        deepseekModel: localStorage.getItem('deepseek_model') || 'deepseek-chat',
        
        // Temperature settings
        temperature: parseFloat(localStorage.getItem('temperature') || '0.8'),
        
        // Debug settings
        debugEnabled: localStorage.getItem('debug_enabled') === 'true' || localStorage.getItem('debug_enabled') === null,
        debugLog: [],
        debugPrettyMode: localStorage.getItem('debug_pretty_mode') !== 'false', // Default to true
        
        // Models that don't support temperature (reasoning models)
        reasoningModels: [
            'o1', 'o1-pro', 'o3', 'o3-mini', 'o4-mini',  // OpenAI reasoning models
            'gemini-2.0-flash-thinking-exp-1219', 'gemini-2.0-flash-thinking-exp-01-21', // Google thinking models
            'deepseek-reasoner' // DeepSeek reasoning model
        ],
        
        // Check if current model supports temperature
        get supportsTemperature() {
            const model = this.selectedModel;
            // Check if it's a reasoning model
            return !this.reasoningModels.some(rm => model.includes(rm));
        },
        
        // Get effective temperature (1.0 for reasoning models)
        get effectiveTemperature() {
            return this.supportsTemperature ? this.temperature : 1.0;
        },
        
        // Get current API key based on provider
        get apiKey() {
            switch(this.selectedProvider) {
                case 'openai': return this.openaiKey;
                case 'anthropic': return this.anthropicKey;
                case 'google': return this.googleKey;
                case 'xai': return this.xaiKey;
                case 'deepseek': return this.deepseekKey;
                default: return '';
            }
        },
        
        // Get current model based on provider
        get selectedModel() {
            switch(this.selectedProvider) {
                case 'openai': return this.openaiModel;
                case 'anthropic': return this.anthropicModel;
                case 'google': return this.googleModel;
                case 'xai': return this.xaiModel;
                case 'deepseek': return this.deepseekModel;
                default: return '';
            }
        },
        
        // Chat state
        messages: [],
        currentInput: '',
        
        // Simulation state
        people: [],
        currentScenario: null,
        conversationHistory: [],
        
        // Available templates (loaded from manifest only)
        availableTemplates: [],
        
        async init() {
            // Initialize managers with the Alpine.js reactive proxy (this)
            this.aiModels = new AIModels(this);
            this.chatManager = new ChatManager(this);
            this.scenarioManager = new ScenarioManager(this);
            this.debugManager = new DebugManager(this);
            this.settingsManager = new SettingsManager(this);
            
            // Bind methods to this Alpine instance
            // Chat methods
            this.getMessageClass = (message) => this.chatManager.getMessageClass(message);
            this.sendMessage = () => this.chatManager.sendMessage();
            this.handleInputKeydown = (event) => this.chatManager.handleInputKeydown(event);
            
            // Scenario methods
            this.startNewScenario = () => this.scenarioManager.startNewScenario();
            this.startScenario = () => this.scenarioManager.startScenario();
            this.selectAndStart = (scenario) => this.scenarioManager.selectAndStart(scenario);
            this.quickStart = (scenario) => this.scenarioManager.quickStart(scenario);
            
            // Debug methods
            this.logDebug = (type, provider, model, data) => this.debugManager.logDebug(type, provider, model, data);
            this.formatDebugJSON = (obj) => this.debugManager.formatDebugJSON(obj);
            
            // Settings methods
            this.saveSettings = () => this.settingsManager.saveSettings();
            
            // Load templates from manifest
            await this.loadTemplatesFromManifest();
            
            // Auto-scroll chat
            this.$watch('messages', () => {
                this.$nextTick(() => {
                    if (this.$refs.chatMessages) {
                        this.$refs.chatMessages.scrollTop = this.$refs.chatMessages.scrollHeight;
                    }
                });
            });
            
            // Also scroll when processing state changes
            this.$watch('processing', () => {
                this.$nextTick(() => {
                    if (this.$refs.chatMessages) {
                        this.$refs.chatMessages.scrollTop = this.$refs.chatMessages.scrollHeight;
                    }
                });
            });
            
            // Reset scenario prompt when switching views
            this.$watch('currentView', (newView, oldView) => {
                if (oldView === 'scenarios' && newView !== 'scenarios') {
                    this.showScenarioPrompt = false;
                }
            });
            
            // Utility methods
            this.copyToClipboard = async (text) => {
                try {
                    await navigator.clipboard.writeText(text);
                    // Show brief success feedback
                    const originalText = event.target.textContent;
                    event.target.textContent = '✓';
                    event.target.style.color = 'var(--secondary-color)';
                    setTimeout(() => {
                        event.target.textContent = originalText;
                        event.target.style.color = '';
                    }, 1000);
                } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        console.log('Text copied to clipboard using fallback method');
                    } catch (err) {
                        console.error('Failed to copy text: ', err);
                    }
                    document.body.removeChild(textArea);
                }
            };
        },
        
        // Simplified template loading from manifest only (now supporting markdown)
        loadTemplatesFromManifest: async function() {
            try {
                console.log('Loading templates from manifest...');
                
                // Load the manifest file
                const manifestResponse = await fetch('./templates/manifest.json');
                if (!manifestResponse.ok) {
                    console.log('No template manifest found');
                    this.availableTemplates = [];
                    return;
                }
                
                const manifest = await manifestResponse.json();
                console.log('Loaded manifest:', manifest);
                const templates = [];
                
                // Load each template file
                for (const templateFile of manifest.templates) {
                    try {
                        console.log(`Loading template file: ${templateFile}`);
                        const templateResponse = await fetch(`./templates/${templateFile}`);
                        if (templateResponse.ok) {
                            const templateContent = await templateResponse.text();
                            console.log(`Template content length: ${templateContent.length}`);
                            
                            // Parse markdown template
                            const template = this.parseMarkdownTemplate(templateContent);
                            templates.push(template);
                            console.log(`Successfully loaded template: ${template.name}`);
                        } else {
                            console.warn(`Failed to load template: ${templateFile} (${templateResponse.status})`);
                        }
                    } catch (error) {
                        console.error(`Error loading template ${templateFile}:`, error);
                    }
                }
                
                this.availableTemplates = templates;
                console.log(`Successfully loaded ${templates.length} templates from manifest`);
                
            } catch (error) {
                console.error('Error loading templates from manifest:', error);
                this.availableTemplates = [];
            }
        },
        
        // Parse markdown template with YAML frontmatter
        parseMarkdownTemplate: function(content) {
            try {
                // Normalize line endings
                const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                
                // Split content into frontmatter and body
                const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
                const match = normalizedContent.match(frontmatterRegex);
                
                if (!match) {
                    console.error('Invalid template format: missing YAML frontmatter');
                    console.log('Content preview:', normalizedContent.substring(0, 200));
                    throw new Error('Invalid template format: missing YAML frontmatter');
                }
                
                const [, frontmatterYaml, markdownBody] = match;
                
                // Parse YAML frontmatter (simple parser for name and summary)
                const frontmatter = this.parseSimpleYaml(frontmatterYaml);
                console.log('Parsed frontmatter:', frontmatter);
                
                // Parse markdown sections
                const sections = this.parseMarkdownSections(markdownBody);
                console.log('Parsed sections:', Object.keys(sections));
                
                // Build template object
                const template = {
                    name: frontmatter.name,
                    summary: frontmatter.summary,
                    systemPrompt: sections['System Prompt'] || '',
                    generationPrompt: sections['Generation Prompt'] || '',
                    dimensions: this.parseDimensions(sections['Dimensions'] || '')
                };
                
                console.log('Built template:', template.name);
                return template;
            } catch (error) {
                console.error('Error parsing markdown template:', error);
                throw error;
            }
        },
        
        // Simple YAML parser for name and summary (basic key-value pairs)
        parseSimpleYaml: function(yamlText) {
            const result = {};
            const lines = yamlText.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const colonIndex = trimmed.indexOf(':');
                    if (colonIndex > 0) {
                        const key = trimmed.substring(0, colonIndex).trim();
                        let value = trimmed.substring(colonIndex + 1).trim();
                        
                        // Remove quotes if present
                        if ((value.startsWith('"') && value.endsWith('"')) || 
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        
                        result[key] = value;
                    }
                }
            }
            
            return result;
        },
        
        // Parse markdown sections by headers
        parseMarkdownSections: function(markdownText) {
            const sections = {};
            
            // Find all level 1 headers (# Header)
            const headerRegex = /^# (.+)$/gm;
            const matches = [...markdownText.matchAll(headerRegex)];
            
            if (matches.length === 0) {
                console.warn('No markdown sections found');
                return sections;
            }
            
            for (let i = 0; i < matches.length; i++) {
                const currentMatch = matches[i];
                const nextMatch = matches[i + 1];
                
                const sectionName = currentMatch[1].trim();
                const startIndex = currentMatch.index + currentMatch[0].length;
                const endIndex = nextMatch ? nextMatch.index : markdownText.length;
                
                const sectionContent = markdownText
                    .substring(startIndex, endIndex)
                    .trim();
                
                sections[sectionName] = sectionContent;
            }
            
            return sections;
        },
        
        // Parse dimensions from markdown list format
        parseDimensions: function(dimensionsText) {
            const dimensions = [];
            if (!dimensionsText) return dimensions;
            
            const lines = dimensionsText.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ')) {
                    const content = trimmed.substring(2).trim();
                    const colonIndex = content.indexOf(':');
                    
                    if (colonIndex > 0) {
                        const name = content.substring(0, colonIndex).trim();
                        const options = content.substring(colonIndex + 1).trim();
                        
                        dimensions.push({
                            name: name,
                            options: options
                        });
                    }
                }
            }
            
            return dimensions;
        }
    };
    
    return app;
};

// Dynamically load Alpine.js after situatorApp is defined
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js';
script.defer = true;
document.head.appendChild(script); 