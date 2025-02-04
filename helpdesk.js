const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const FormData = require("form-data");

class HelpDesk {
    #socket;
    #getText;
    #sendMessage;
    #membersLimit;
    #trigger;
    #freshdeskConfig;
    #threadsDB;
    #threads;
    #lastProcessedUpdatesDB;
    #lastProcessedUpdates;
    #predefinedResponses = {
        'hi': 'Hello! 👋 Welcome to our support. How can we assist you today?',
        'hello': 'Hi there! 👋 Welcome to our support. How can we assist you today?',
        'hey': 'Hi! 👋 Welcome to our support. How can we assist you today?',
        'help': 'I can help you with:\n- Product inquiries\n- Technical support\n- Billing questions\n\nJust type !ask followed by your question!',
        'status': 'Our services are currently operational. If you\'re experiencing issues, please describe them in detail.',
        'pricing': 'Our pricing plans are customized based on your needs. A sales representative will contact you shortly.',
        'support': 'You\'re already in the support chat! Please describe your issue, and we\'ll assist you right away.',
        'contact': 'You can reach us through:\n- This chat support\n- Email: support@example.com\n- Phone: +1234567890',
    };

    constructor(config = {}) {
        this.#membersLimit = config.membersLimit || 100;
        this.#trigger = config.trigger || '!ask';
        this.#freshdeskConfig = {
            apiKey: process.env.FRESHDESK_API_KEY || config.freshdeskApiKey,
            domain: process.env.FRESHDESK_DOMAIN || config.freshdeskDomain
        };
        this.#threadsDB = config.threadsDB || 'threads.json';
        this.#lastProcessedUpdatesDB = config.lastProcessedUpdatesDB || 'lastProcessedUpdates.json';
        this.#loadThreads();
        this.#loadLastProcessedUpdates();
    }

    #loadLastProcessedUpdates() {
        try {
            this.#lastProcessedUpdates = fs.existsSync(this.#lastProcessedUpdatesDB)
                ? JSON.parse(fs.readFileSync(this.#lastProcessedUpdatesDB, 'utf8'))
                : {};
        } catch (error) {
            console.error('Error loading last processed updates:', error);
            this.#lastProcessedUpdates = {};
        }
    }

    #saveLastProcessedUpdates() {
        try {
            fs.writeFileSync(this.#lastProcessedUpdatesDB, JSON.stringify(this.#lastProcessedUpdates, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving last processed updates:', error);
        }
    }

    init(socket, getText, sendMessage) {
        this.#socket = socket;
        this.#getText = getText;
        this.#sendMessage = sendMessage;
    }

    addPredefinedResponse(trigger, response) {
        this.#predefinedResponses[trigger.toLowerCase()] = response;
    }

    #checkPredefinedResponse(text) {
        const cleanText = text.toLowerCase().trim();
        return this.#predefinedResponses[cleanText] || null;
    }

    #loadThreads() {
        try {
            this.#threads = fs.existsSync(this.#threadsDB)
                ? JSON.parse(fs.readFileSync(this.#threadsDB, 'utf8'))
                : {};
        } catch (error) {
            console.error('Error loading threads:', error);
            this.#threads = {};
        }
    }

    #saveThreads() {
        try {
            fs.writeFileSync(this.#threadsDB, JSON.stringify(this.#threads, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving threads:', error);
        }
    }

    async #uploadImageToHostingService(imageBuffer, imageMimeType) {
        // Replace this with your preferred image hosting service API
        // Example: ImgBB (https://api.imgbb.com/)
        const apiKey = '3f4dabd545377c23ac9b61f9cd605d0a'; // Replace with your ImgBB API key
        const formData = new FormData();
        formData.append('image', imageBuffer.toString('base64'));

        try {
            const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
            });
            return response.data.data.url; // Return the public URL of the uploaded image
        } catch (error) {
            console.error('Error uploading image:', error.response?.data || error);
            return null;
        }
    }

    async #createFreshdeskTicket(user, message, imageUrl) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets`;

        const data = {
            subject: `Query from ${user.name || user.number}`,
            description: imageUrl ? `${message}\n\nAttached Image: ${imageUrl}` : message,
            email: `${user.number}@whatsapp.com`,
            priority: 1,
            status: 2,
            source: 3 // WhatsApp
        };

        try {
            const response = await axios.post(url, data, {
                auth: {
                    username: this.#freshdeskConfig.apiKey,
                    password: 'X'
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('Ticket created:', response.data.id);
            return response.data.id;
        } catch (error) {
            console.error('Error creating ticket:', error.response?.data || error);
            await this.#sendMessage(user.number + '@s.whatsapp.net', {
                text: '❌ Sorry, we couldn\'t create your support ticket. Please try again later.'
            });
            return null;
        }
    }

    async #updateFreshdeskTicket(ticketId, message, imageUrl) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}/notes`;

        const data = {
            body: imageUrl ? `${message}\n\nAttached Image: ${imageUrl}` : message,
            private: false
        };

        try {
            await axios.post(url, data, {
                auth: {
                    username: this.#freshdeskConfig.apiKey,
                    password: 'X'
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return true;
        } catch (error) {
            console.error('Error updating ticket:', error.response?.data || error);
            return false;
        }
    }

    async #getFreshdeskTicket(ticketId) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}`;
        try {
            const response = await axios.get(url, {
                auth: {
                    username: this.#freshdeskConfig.apiKey,
                    password: 'X'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching ticket:', error.response?.data || error);
            return null;
        }
    }

    async #getFreshdeskConversations(ticketId) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}/conversations`;
        try {
            const response = await axios.get(url, {
                auth: {
                    username: this.#freshdeskConfig.apiKey,
                    password: 'X'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching conversations:', error.response?.data || error);
            return [];
        }
    }

    async handleMessage(bot, msg, sender, jid) {
        try {
            const userNumber = sender.split("@")[0];
            const messageText =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                "";

            const cleanMessage = messageText.slice(this.#trigger.length).trim();

            // Check for predefined responses first
            const predefinedResponse = this.#checkPredefinedResponse(cleanMessage);
            if (predefinedResponse) {
                await this.#sendMessage(jid, { text: predefinedResponse });
                return;
            }

            // Check if message starts with trigger




            // Handle attachments
            let imageUrl = null;

            if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage) {
                try {
                    const imageBuffer = await downloadMediaMessage(msg, "buffer", {});
                    const imageMimeType =
                        msg.message.imageMessage?.mimetype ||
                        msg.message.videoMessage?.mimetype ||
                        msg.message.documentMessage?.mimetype;

                    // Upload image to hosting service
                    imageUrl = await this.#uploadImageToHostingService(imageBuffer, imageMimeType);
                } catch (error) {
                    console.error("Error downloading or uploading media:", error);
                }
            }

            const fmsg = imageUrl ? `${cleanMessage}\n\nAttached Image: ${imageUrl}` : cleanMessage;
            console.log(fmsg);

            // Create or update ticket
            if (!this.#threads[userNumber]) {
                const ticketId = await this.#createFreshdeskTicket(
                    { number: userNumber },
                    cleanMessage,
                    imageUrl
                );
                if (ticketId) {
                    this.#threads[userNumber] = {
                        ticketId: ticketId,
                        originalQuestion: fmsg,
                        jid: jid
                    };
                    this.#saveThreads();
                    await this.#sendMessage(sender, {
                        text: "✅ Your support ticket has been created. We'll get back to you soon!",
                    });
                }
            } else {
                const updated = await this.#updateFreshdeskTicket(
                    this.#threads[userNumber].ticketId,
                    cleanMessage,
                    imageUrl
                );
                if (updated) {
                    this.#threads[userNumber].originalQuestion = fmsg;
                    this.#threads[userNumber].jid = jid;
                    this.#saveThreads();
                    await this.#sendMessage(sender, {
                        text: "✅ Your message has been added to the support ticket.",
                    });
                }
            }
        } catch (error) {
            console.error("Error handling message:", error);
            await this.#sendMessage(sender, { text: "❌ An error occurred. Please try again later." });
        }
    }

    async checkFreshdeskReplies(bot) {
        for (const userNumber in this.#threads) {
            try {
                const { ticketId, originalQuestion, jid } = this.#threads[userNumber];

                const [ticket, conversations] = await Promise.all([
                    this.#getFreshdeskTicket(ticketId),
                    this.#getFreshdeskConversations(ticketId)
                ]);

                if (!ticket) continue;

                // Find the latest public note or reply
                const latestUpdates = [
                    ...(conversations || []).filter(c => !c.private),
                ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                if (latestUpdates.length > 0) {
                    const lastUpdate = latestUpdates[0];
                    const updateId = `${ticketId}-${lastUpdate.id}`;

                    // Skip if this update has already been processed
                    if (this.#lastProcessedUpdates[userNumber] === updateId) {
                        continue;
                    }

                    // Extract plain text from HTML (using cheerio or regex, as shown earlier)
                    const plainText = lastUpdate.body.replace(/<[^>]+>/g, '').trim();

                    if (plainText.toLowerCase() === originalQuestion.toLowerCase()) {
                        console.log(`Skipping duplicate response for user ${userNumber}`);
                        continue; // Skip sending the response
                    }

                    // Format the message with a mention
                    const userJid = `${userNumber}@s.whatsapp.net`;
                    const formattedMessage = {
                        text: `🎫 Ticket #${ticketId}\n👤 @${userNumber}\n\n${plainText}`,
                        mentions: [userJid] // Add the user's JID to the mentions array
                    };

                    // Send to message
                    if (jid.includes('@g.us')) {
                        await this.#sendMessage(jid, formattedMessage);
                        await this.#sendMessage(userJid, { text: plainText });
                    } else {
                        await this.#sendMessage(jid, { text: plainText });
                    }

                    // Update last processed update for this user
                    this.#lastProcessedUpdates[userNumber] = updateId;
                    this.#saveLastProcessedUpdates(); // Save to file
                }

                // Check if ticket is resolved or closed
                if (ticket.status === 4 || ticket.status === 5) {
                    delete this.#threads[userNumber];
                    this.#saveThreads();
                }
            } catch (error) {
                console.error(`Error processing updates for ${userNumber}:`, error);
            }
        }
    }
}

module.exports = HelpDesk;