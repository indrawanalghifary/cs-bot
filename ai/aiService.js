const { GoogleGenerativeAI } = require('@google/generative-ai');
const Database = require('../database/database');

class AIService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.db = new Database();
        this.initialized = false;
        
        this.initializeAI();
    }

    async initializeAI() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            
            if (!apiKey || apiKey === 'your-gemini-api-key-here') {
                console.warn('Gemini API key not configured. AI responses will be disabled.');
                return;
            }

            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
            this.initialized = true;
            
            console.log('Google Gemini AI initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Gemini AI:', error);
        }
    }

    async generateResponse(userMessage, contactPhone) {
        try {
            if (!this.initialized) {
                return this.getFallbackResponse();
            }

            // Get conversation history for context
            const messageHistory = await this.db.getMessages(contactPhone, 10);
            
            // Build context from recent messages
            let context = "Anda adalah asisten customer service yang ramah dan membantu. ";
            context += "Berikan respons yang profesional dalam bahasa Indonesia. ";
            context += "Jika pertanyaan terkait teknis atau memerlukan escalation, arahkan ke tim yang tepat.\\n\\n";
            
            if (messageHistory.length > 0) {
                context += "Riwayat percakapan sebelumnya:\\n";
                messageHistory.reverse().forEach(msg => {
                    const sender = msg.message_type === 'incoming' ? 'Customer' : 'CS';
                    context += `${sender}: ${msg.content}\\n`;
                });
                context += "\\n";
            }
            
            context += `Customer baru saja mengatakan: "${userMessage}"\\n\\n`;
            context += "Berikan respons yang sesuai sebagai customer service:";

            const result = await this.model.generateContent(context);
            const response = await result.response;
            const text = response.text();

            if (text && text.trim()) {
                return text.trim();
            } else {
                return this.getFallbackResponse();
            }

        } catch (error) {
            console.error('AI response generation error:', error);
            return this.getFallbackResponse();
        }
    }

    getFallbackResponse() {
        const fallbackResponses = [
            "Terima kasih telah menghubungi kami. Tim customer service kami akan segera membantu Anda.",
            "Halo! Saya telah menerima pesan Anda. Mohon tunggu sebentar, tim kami akan segera merespons.",
            "Terima kasih atas pertanyaan Anda. Kami akan memproses dan memberikan jawaban yang tepat secepatnya.",
            "Halo! Pesan Anda sangat penting bagi kami. Tim customer service akan segera menghubungi Anda kembali."
        ];
        
        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }

    async generateBulkMessageVariations(baseMessage, count = 1) {
        try {
            if (!this.initialized || count === 1) {
                return [baseMessage];
            }

            const prompt = `Buatkan ${count} variasi dari pesan ini agar terlihat lebih personal dan tidak seperti spam:\\n\\n"${baseMessage}"\\n\\nBerikan variasi yang tetap mempertahankan makna asli tetapi dengan struktur kalimat yang berbeda. Pisahkan setiap variasi dengan "---"`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (text && text.trim()) {
                const variations = text.split('---').map(v => v.trim()).filter(v => v);
                return variations.slice(0, count);
            } else {
                return [baseMessage];
            }

        } catch (error) {
            console.error('Error generating message variations:', error);
            return [baseMessage];
        }
    }

    async isSpamMessage(message) {
        try {
            if (!this.initialized) {
                return false;
            }

            const prompt = `Analisis apakah pesan berikut ini termasuk spam, promotional yang tidak diinginkan, atau pesan yang tidak pantas:\\n\\n"${message}"\\n\\nJawab hanya dengan "YA" jika spam atau "TIDAK" jika bukan spam.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim().toUpperCase();

            return text === 'YA';

        } catch (error) {
            console.error('Error checking spam:', error);
            return false;
        }
    }

    async categorizeMessage(message) {
        try {
            if (!this.initialized) {
                return 'general';
            }

            const prompt = `Kategorikan pesan customer service berikut ke dalam salah satu kategori: "sales", "support", "complaint", "general", "billing":\\n\\n"${message}"\\n\\nJawab hanya dengan nama kategori.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim().toLowerCase();

            const validCategories = ['sales', 'support', 'complaint', 'general', 'billing'];
            if (validCategories.includes(text)) {
                return text;
            } else {
                return 'general';
            }

        } catch (error) {
            console.error('Error categorizing message:', error);
            return 'general';
        }
    }

    isConfigured() {
        return this.initialized;
    }
}

module.exports = AIService;