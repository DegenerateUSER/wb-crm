/*const { BlobServiceClient } = require('@azure/storage-blob');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
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
    //#lastProcessedUpdatesDB;
    //#lastProcessedUpdates;
    #azureConnectionString;
    #azureContainerName;
    #blobServiceClient;
    #predefinedResponses = {
        'hi': 'Hello! 👋 Welcome to our support. How can we assist you today?',
    };

    constructor(config = {}) {
        this.#membersLimit = config.membersLimit || 100;
        this.#trigger = config.trigger || '!ask';
        this.#freshdeskConfig = {
            apiKey: process.env.FRESHDESK_API_KEY || config.freshdeskApiKey,
            domain: process.env.FRESHDESK_DOMAIN || config.freshdeskDomain
        };
        this.#threadsDB = config.threadsDB || 'threads.json';
        //this.#lastProcessedUpdatesDB = config.lastProcessedUpdatesDB || 'lastProcessedUpdates.json';
        this.#loadThreads();
        //this.#loadLastProcessedUpdates();

        // Initialize Azure Blob Storage client
        this.#azureConnectionString = "DefaultEndpointsProtocol=https;AccountName=testingedg;AccountKey=iI4EcWbT8UjF8dlGkkiBOLABU1GndwqzFJuOV3hJmIRd7BNbx8Cqm56oyiFs/RcKLPjbmqWlXGC9+ASt9a3sYg==;EndpointSuffix=core.windows.net" || config.azureConnectionString;
        this.#azureContainerName = config.azureContainerName || 'media-uploads';
        this.#blobServiceClient = BlobServiceClient.fromConnectionString(this.#azureConnectionString);
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

    async #uploadMediaToAzure(mediaBuffer, mediaMimeType, mediaName) {
        try {
            const containerClient = this.#blobServiceClient.getContainerClient(this.#azureContainerName);
            const blobClient = containerClient.getBlockBlobClient(mediaName);

            // Upload the media file
            await blobClient.uploadData(mediaBuffer, {
                blobHTTPHeaders: { blobContentType: mediaMimeType }
            });

            // Generate a public URL for the uploaded file
            return blobClient.url;
        } catch (error) {
            console.error('Error uploading media to Azure Blob Storage:', error);
            return null;
        }
    }

    async #createFreshdeskTicket(user, message, mediaUrl) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets`;

        const data = {
            subject: `Query from ${user.name || user.number}`,
            description: mediaUrl ? `${message}\n\nAttached Media: ${mediaUrl}` : message,
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

    async #updateFreshdeskTicket(ticketId, message, mediaUrl) {
        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}/notes`;

        const data = {
            body: mediaUrl ? `${message}\n\nAttached Media: ${mediaUrl}` : message,
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

            // Handle attachments
            let mediaUrl = null;

            if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage) {
                try {
                    const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
                    const mediaMimeType =
                        msg.message.imageMessage?.mimetype ||
                        msg.message.videoMessage?.mimetype ||
                        msg.message.documentMessage?.mimetype;

                    const mediaName = `media_${Date.now()}.${mediaMimeType.split('/')[1]}`;

                    // Upload media to Azure Blob Storage
                    mediaUrl = await this.#uploadMediaToAzure(mediaBuffer, mediaMimeType, mediaName);
                } catch (error) {
                    console.error("Error downloading or uploading media:", error);
                }
            }

            const fmsg = mediaUrl ? `${cleanMessage}\n\nAttached Media: ${mediaUrl}` : cleanMessage;
            console.log(fmsg);

            // Check if the user has an existing ticket in the same group
            const today = new Date().toISOString().split('T')[0];
            const groupId = jid; // Use group ID (jid) to differentiate tickets
            const userThread = this.#threads[userNumber]?.[groupId];

            if (!userThread || userThread.lastUpdated !== today) {
                // Create a new ticket for the user in this group
                const ticketId = await this.#createFreshdeskTicket(
                    { number: userNumber },
                    cleanMessage,
                    mediaUrl
                );
                if (ticketId) {
                    if (!this.#threads[userNumber]) this.#threads[userNumber] = {};
                    this.#threads[userNumber][groupId] = {
                        ticketId: ticketId,
                        originalQuestion: fmsg,
                        lastResponse: null, // Track the last response
                        lastUpdated: today
                    };
                    this.#saveThreads();
                    await this.#sendMessage(sender, {
                        text: "✅ Your support ticket has been created. We'll get back to you soon!",
                    });
                }
            } else {
                // Update the existing ticket
                const updated = await this.#updateFreshdeskTicket(
                    userThread.ticketId,
                    cleanMessage,
                    mediaUrl
                );
                if (updated) {
                    userThread.originalQuestion = fmsg;
                    userThread.lastUpdated = today;
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
            for (const groupId in this.#threads[userNumber]) {
                try {
                    const { ticketId, originalQuestion, lastResponse } = this.#threads[userNumber][groupId];

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
                        //if (this.#lastProcessedUpdates[userNumber]?.[groupId] === updateId) {
                        //    continue;
                        //}

                        // Extract plain text from HTML
                        const plainText = lastUpdate.body.replace(/<[^>]+>/g, '').trim();

                        // Skip if the response is the same as the last response
                        if (
                            plainText.toLowerCase() === lastResponse?.toLowerCase() ||
                            plainText.toLowerCase() === originalQuestion?.toLowerCase()
                        ) {
                            console.log(`Skipping duplicate response for user ${userNumber}`);
                            continue;
                        }


                        // Format the message with a mention
                        const userJid = `${userNumber}@s.whatsapp.net`;
                        const formattedMessage = {
                            text: `🎫 Ticket #${ticketId}\n👤 @${userNumber}\n\n${plainText}`,
                            mentions: [userJid]
                        };

                        // Send to message
                        if (groupId.includes('@g.us')) {
                            await this.#sendMessage(groupId, formattedMessage);
                            await this.#sendMessage(userJid, { text: plainText });
                        } else {
                            await this.#sendMessage(groupId, { text: plainText });
                        }

                        // Update last processed update and last response
                        // if (!this.#lastProcessedUpdates[userNumber]) this.#lastProcessedUpdates[userNumber] = {};
                        // this.#lastProcessedUpdates[userNumber][groupId] = updateId;
                        this.#threads[userNumber][groupId].lastResponse = plainText;
                        // this.#saveLastProcessedUpdates();
                        this.#saveThreads();
                    }

                    // Check if ticket is resolved or closed
                    if (ticket.status === 4 || ticket.status === 5) {
                        delete this.#threads[userNumber][groupId];
                        this.#saveThreads();
                    }
                } catch (error) {
                    console.error(`Error processing updates for ${userNumber} in group ${groupId}:`, error);
                }
            }
        }
    }
}

module.exports = HelpDesk;  */

const { BlobServiceClient } = require('@azure/storage-blob');
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
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
    #azureConnectionString;
    #azureContainerName;
    #blobServiceClient;
    #predefinedResponses = {
        'hi': 'Hello! 👋 Welcome to our support. How can we assist you today?',
    };

    constructor(config = {}) {
        try {
            this.#membersLimit = config.membersLimit || 100;
            this.#trigger = config.trigger || '!ask';
            this.#freshdeskConfig = {
                apiKey: process.env.FRESHDESK_API_KEY || config.freshdeskApiKey,
                domain: process.env.FRESHDESK_DOMAIN || config.freshdeskDomain
            };

            if (!this.#freshdeskConfig.apiKey || !this.#freshdeskConfig.domain) {
                throw new Error('Missing required Freshdesk configuration');
            }

            this.#threadsDB = config.threadsDB || 'threads.json';
            this.#loadThreads();

            this.#azureConnectionString = config.azureConnectionString || 'DefaultEndpointsProtocol=https;AccountName=testingedg;AccountKey=iI4EcWbT8UjF8dlGkkiBOLABU1GndwqzFJuOV3hJmIRd7BNbx8Cqm56oyiFs/RcKLPjbmqWlXGC9+ASt9a3sYg==;EndpointSuffix=core.windows.net';
            if (!this.#azureConnectionString) {
                throw new Error('Azure connection string is required');
            }

            this.#azureContainerName = config.azureContainerName || 'media-uploads';
            this.#blobServiceClient = BlobServiceClient.fromConnectionString(this.#azureConnectionString);
        } catch (error) {
            console.error('Error initializing HelpDesk:', error);
            throw new Error('Failed to initialize HelpDesk: ' + error.message);
        }
    }

    init(socket, getText, sendMessage) {
        if (!socket || !getText || !sendMessage) {
            throw new Error('Missing required parameters for initialization');
        }
        this.#socket = socket;
        this.#getText = getText;
        this.#sendMessage = sendMessage;
    }

    addPredefinedResponse(trigger, response) {
        if (!trigger || !response) {
            throw new Error('Both trigger and response are required');
        }
        this.#predefinedResponses[trigger.toLowerCase()] = response;
    }

    #checkPredefinedResponse(text) {
        if (!text) return null;
        const cleanText = text.toLowerCase().trim();
        return this.#predefinedResponses[cleanText] || null;
    }

    #loadThreads() {
        try {
            if (!fs.existsSync(this.#threadsDB)) {
                this.#threads = {};
                this.#saveThreads();
                return;
            }
            const data = fs.readFileSync(this.#threadsDB, 'utf8');
            this.#threads = JSON.parse(data);
        } catch (error) {
            console.error('Error loading threads:', error);
            this.#threads = {};
            this.#saveThreads();
        }
    }

    #saveThreads() {
        try {
            fs.writeFileSync(this.#threadsDB, JSON.stringify(this.#threads, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving threads:', error);
            throw new Error('Failed to save threads: ' + error.message);
        }
    }

    async #uploadMediaToAzure(mediaBuffer, mediaMimeType, mediaName) {
        if (!mediaBuffer || !mediaMimeType || !mediaName) {
            throw new Error('Missing required parameters for media upload');
        }

        try {
            const containerClient = this.#blobServiceClient.getContainerClient(this.#azureContainerName);
            await containerClient.createIfNotExists();

            const blobClient = containerClient.getBlockBlobClient(mediaName);
            await blobClient.uploadData(mediaBuffer, {
                blobHTTPHeaders: { blobContentType: mediaMimeType }
            });

            return blobClient.url;
        } catch (error) {
            console.error('Error uploading media to Azure Blob Storage:', error);
            throw new Error('Failed to upload media: ' + error.message);
        }
    }

    async #createFreshdeskTicket(user, message, mediaUrl) {
        if (!user || !message) {
            throw new Error('User and message are required to create a ticket');
        }

        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets`;
        const data = {
            subject: `Query from ${user.name || user.number}`,
            description: mediaUrl ? `${message}\n\nAttached Media: ${mediaUrl}` : message,
            email: `${user.number}@whatsapp.com`,
            priority: 1,
            status: 2,
            source: 3
        };

        try {
            const response = await axios.post(url, data, {
                auth: { username: this.#freshdeskConfig.apiKey, password: 'X' },
                headers: { 'Content-Type': 'application/json' }
            });

            return response.data.id;
        } catch (error) {
            console.error('Error creating ticket:', error.response?.data || error);
            throw new Error('Failed to create ticket: ' + (error.response?.data?.message || error.message));
        }
    }

    async #updateFreshdeskTicket(ticketId, message, mediaUrl) {
        if (!ticketId || !message) {
            throw new Error('Ticket ID and message are required for update');
        }

        const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}/notes`;
        const data = {
            body: mediaUrl ? `${message}\n\nAttached Media: ${mediaUrl}` : message,
            private: false
        };

        try {
            await axios.post(url, data, {
                auth: { username: this.#freshdeskConfig.apiKey, password: 'X' },
                headers: { 'Content-Type': 'application/json' }
            });
            return true;
        } catch (error) {
            console.error('Error updating ticket:', error.response?.data || error);
            throw new Error('Failed to update ticket: ' + (error.response?.data?.message || error.message));
        }
    }

    async #getFreshdeskTicket(ticketId) {
        if (!ticketId) {
            throw new Error('Ticket ID is required');
        }

        try {
            const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}`;
            const response = await axios.get(url, {
                auth: { username: this.#freshdeskConfig.apiKey, password: 'X' }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching ticket:', error.response?.data || error);
            return null;
        }
    }

    async #getFreshdeskConversations(ticketId) {
        if (!ticketId) {
            throw new Error('Ticket ID is required');
        }

        try {
            const url = `https://${this.#freshdeskConfig.domain}.freshdesk.com/api/v2/tickets/${ticketId}/conversations`;
            const response = await axios.get(url, {
                auth: { username: this.#freshdeskConfig.apiKey, password: 'X' }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching conversations:', error.response?.data || error);
            return [];
        }
    }

    async handleMessage(bot, msg, sender, jid) {
        if (!msg || !sender || !jid) {
            throw new Error('Missing required parameters for handling message');
        }

        try {
            const userNumber = sender.split("@")[0];
            const messageText = this.#extractMessageText(msg);
            const cleanMessage = messageText.slice(this.#trigger.length).trim();

            const predefinedResponse = this.#checkPredefinedResponse(cleanMessage);
            if (predefinedResponse) {
                await this.#sendMessage(jid, { text: predefinedResponse });
                return;
            }

            const mediaUrl = await this.#handleMediaAttachment(msg);
            const formattedMessage = mediaUrl ? `${cleanMessage}\n\nAttached Media: ${mediaUrl}` : cleanMessage;

            await this.#processTicket(userNumber, jid, cleanMessage, mediaUrl, formattedMessage, sender);
        } catch (error) {
            console.error("Error handling message:", error);
            await this.#sendMessage(sender, {
                text: "❌ An error occurred: " + (error.message || "Please try again later.")
            });
        }
    }

    #extractMessageText(msg) {
        return msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";
    }

    async #handleMediaAttachment(msg) {
        if (!msg.message?.imageMessage && !msg.message?.videoMessage && !msg.message?.documentMessage) {
            return null;
        }

        try {
            const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
            const mediaMimeType = msg.message.imageMessage?.mimetype ||
                msg.message.videoMessage?.mimetype ||
                msg.message.documentMessage?.mimetype;
            const mediaName = `media_${Date.now()}.${mediaMimeType.split('/')[1]}`;

            return await this.#uploadMediaToAzure(mediaBuffer, mediaMimeType, mediaName);
        } catch (error) {
            console.error("Error handling media attachment:", error);
            throw new Error('Failed to process media attachment: ' + error.message);
        }
    }

    async #processTicket(userNumber, groupId, cleanMessage, mediaUrl, formattedMessage, sender) {
        const today = new Date().toISOString().split('T')[0];
        const userThread = this.#threads[userNumber]?.[groupId];

        try {
            if (!userThread || userThread.lastUpdated !== today) {
                await this.#createNewTicket(userNumber, groupId, cleanMessage, mediaUrl, formattedMessage, sender);
            } else {
                await this.#updateExistingTicket(userThread, userNumber, groupId, cleanMessage, mediaUrl, formattedMessage, sender);
            }
        } catch (error) {
            throw new Error('Failed to process ticket: ' + error.message);
        }
    }

    async #createNewTicket(userNumber, groupId, cleanMessage, mediaUrl, formattedMessage, sender) {
        const ticketId = await this.#createFreshdeskTicket(
            { number: userNumber },
            cleanMessage,
            mediaUrl
        );

        if (ticketId) {
            if (!this.#threads[userNumber]) this.#threads[userNumber] = {};
            this.#threads[userNumber][groupId] = {
                ticketId,
                originalQuestion: formattedMessage,
                lastResponse: null,
                lastUpdated: new Date().toISOString().split('T')[0]
            };
            this.#saveThreads();
            await this.#sendMessage(sender, {
                text: "✅ Your support ticket has been created. We'll get back to you soon!",
            });
        }
    }

    async #updateExistingTicket(userThread, userNumber, groupId, cleanMessage, mediaUrl, formattedMessage, sender) {
        const updated = await this.#updateFreshdeskTicket(
            userThread.ticketId,
            cleanMessage,
            mediaUrl
        );

        if (updated) {
            userThread.originalQuestion = formattedMessage;
            userThread.lastUpdated = new Date().toISOString().split('T')[0];
            this.#saveThreads();
            await this.#sendMessage(sender, {
                text: "✅ Your message has been added to the support ticket.",
            });
        }
    }

    async checkFreshdeskReplies(bot) {
        for (const userNumber in this.#threads) {
            for (const groupId in this.#threads[userNumber]) {
                try {
                    const thread = this.#threads[userNumber][groupId];
                    const [ticket, conversations] = await Promise.all([
                        this.#getFreshdeskTicket(thread.ticketId),
                        this.#getFreshdeskConversations(thread.ticketId)
                    ]);

                    if (!ticket) continue;

                    const latestUpdates = conversations
                        .filter(c => !c.private)
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                    if (latestUpdates.length > 0) {
                        await this.#processLatestUpdate(latestUpdates[0], thread, userNumber, groupId);
                    }

                    if (ticket.status === 4 || ticket.status === 5) {
                        delete this.#threads[userNumber][groupId];
                        this.#saveThreads();
                    }
                } catch (error) {
                    console.error(`Error processing updates for ${userNumber} in group ${groupId}:`, error);
                }
            }
        }
    }

    async #processLatestUpdate(lastUpdate, thread, userNumber, groupId) {
        const plainText = lastUpdate.body.replace(/<[^>]+>/g, '').trim();

        if (plainText.toLowerCase() === thread.lastResponse?.toLowerCase() ||
            plainText.toLowerCase() === thread.originalQuestion?.toLowerCase()) {
            return;
        }

        const userJid = `${userNumber}@s.whatsapp.net`;
        const formattedMessage = {
            text: `🎫 Ticket #${thread.ticketId}\n👤 @${userNumber}\n\n${plainText}`,
            mentions: [userJid]
        };

        try {
            if (groupId.includes('@g.us')) {
                await this.#sendMessage(groupId, formattedMessage);
                await this.#sendMessage(userJid, { text: plainText });
            } else {
                await this.#sendMessage(groupId, { text: plainText });
            }

            thread.lastResponse = plainText;
            this.#saveThreads();
        } catch (error) {
            console.error('Error sending message:', error);
            throw new Error('Failed to send message: ' + error.message);
        }
    }
}

module.exports = HelpDesk;


