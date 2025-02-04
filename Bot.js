/*const makeWASocket = require("@whiskeysockets/baileys").default;
const { DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const axios = require("axios");

class Bot {
  #socket;
  #messageStore = {};
  #emptyChar = "‎ ";
  #authFolder;
  #selfReply;
  #saveCredentials;
  #logMessages;
  #plugins;
  #llmApiUrl;

  constructor(plugins = [], config = {}) {
    this.#plugins = plugins;
    this.#authFolder = config.authFolder || "auth";
    this.#selfReply = config.selfReply || false;
    this.#logMessages = config.logMessages || true;

    // Initialize custom LLM API URL
    if (config.llmApiUrl) {
      this.#llmApiUrl = config.llmApiUrl;
    } else {
      console.warn("LLM API URL not provided.");
    }
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.#authFolder);

    this.#saveCredentials = saveCreds;

    this.#socket = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      getMessage: this.#getMessageFromStore,
      logger: P({ level: "error" }),
      downloadHistory: false,
    });

    this.#plugins.forEach((plugin) =>
        plugin.init(this.#socket, this.#getText, this.#sendMessage)
    );
  }

  async run() {
    this.#socket.ev.process(async (events) => {
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
          if (
              lastDisconnect?.error?.output?.statusCode ===
              DisconnectReason.loggedOut
          ) {
            console.log("Connection closed. You are logged out.");
          } else if (
              lastDisconnect?.error?.output?.statusCode ===
              DisconnectReason.timedOut
          ) {
            console.log(
                new Date().toLocaleTimeString(),
                "Timed out. Will retry in 1 minute."
            );
            setTimeout(this.#restart.bind(this), 60 * 1000);
          } else {
            this.#restart();
          }
        }
      }

      if (events["creds.update"]) {
        await this.#saveCredentials();
      }

      if (events["messages.upsert"]) {
        const { messages } = events["messages.upsert"];

        if (this.#logMessages) console.log("msg upsert", messages);

        messages.forEach(async (msg) => {
          const { key, message } = msg;

          if (!message || this.#getText(key, message).includes(this.#emptyChar))
            return;

          // Handle incoming messages
          await this.#handleMessage(key, message);
        });
      }
    });
  }

  async #restart() {
    await this.connect();
    await this.run();
  }

  #getMessageFromStore = (key) => {
    const { id } = key;
    if (this.#messageStore[id]) return this.#messageStore[id].message;
  };

  #getText(key, message) {
    try {
      let text = message.conversation || message.extendedTextMessage.text;

      if (key.participant) {
        const me = key.participant.slice(0, 12);
        text = text.replace(/\@me\b/g, `@${me}`);
      }

      return text;
    } catch (err) {
      return "";
    }
  }

  #sendMessage = async (jid, content, ...args) => {
    try {
      if (!this.#selfReply) content.text = content.text + this.#emptyChar;

      const sent = await this.#socket.sendMessage(jid, content, ...args);
      this.#messageStore[sent.key.id] = sent;
    } catch (err) {
      console.log("Error sending message", err);
    }
  };

  // Handle Incoming Messages
  async #handleMessage(key, message) {
    const jid = key.remoteJid;
    const text = this.#getText(key, message);

    if (text.startsWith("!ask")) {
      const prompt = text.slice(5).trim(); // Extract prompt after "!ask"
      if (this.#llmApiUrl) {
        try {
          const response = await axios.post(this.#llmApiUrl, { question: prompt });
          const llmResponse = response.data.response;

          await this.#sendMessage(jid, { text: llmResponse });
        } catch (err) {
          console.error("Error communicating with LLM API:", err);
          await this.#sendMessage(jid, { text: "Sorry, I couldn't process that." });
        }
      } else {
        await this.#sendMessage(jid, {
          text: "LLM integration is not configured.",
        });
      }
    }
  }
}

module.exports = Bot;*/

const makeWASocket = require("@whiskeysockets/baileys").default;
const { DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const HelpDesk = require("./helpdesk"); // Import the HelpDesk class

class Bot {
  #socket;
  #messageStore = {};
  #emptyChar = "‎ ";
  #authFolder;
  #selfReply;
  #saveCredentials;
  #logMessages;
  #plugins;
  #helpDesk;

  constructor(plugins = [], config = {}) {
    this.#plugins = plugins;
    this.#authFolder = config.authFolder || "auth";
    this.#selfReply = config.selfReply || false;
    this.#logMessages = config.logMessages || true;

    // Initialize HelpDesk
    this.#helpDesk = new HelpDesk({
      membersLimit:   100,
      trigger:  "!ask",
      freshdeskApiKey: config.freshdeskApiKey || 'YD2wjGoH5Iu2XbR1WtC',
      freshdeskDomain: config.freshdeskDomain || 'brsgsc',
      threadsDB: config.threadsDB || "threads.json"
    });
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.#authFolder);
    this.#saveCredentials = saveCreds;

    this.#socket = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      getMessage: this.#getMessageFromStore,
      logger: P({ level: "error" }),
      downloadHistory: false,
    });

    // Initialize helpdesk with socket and message functions
    this.#helpDesk.init(
        this.#socket,
        this.#getText.bind(this),
        this.#sendMessage.bind(this)
    );

    // Initialize other plugins
    this.#plugins.forEach((plugin) =>
        plugin.init(this.#socket, this.#getText.bind(this), this.#sendMessage.bind(this))
    );
  }

  async run() {
    this.#socket.ev.process(async (events) => {
      if (events["connection.update"]) {
        const update = events["connection.update"];
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
          if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
            console.log("Connection closed. You are logged out.");
          } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.timedOut) {
            console.log(
                new Date().toLocaleTimeString(),
                "Timed out. Will retry in 1 minute."
            );
            setTimeout(this.#restart.bind(this), 60 * 1000);
          } else {
            this.#restart();
          }
        }
      }

      if (events["creds.update"]) {
        await this.#saveCredentials();
      }

      if (events["messages.upsert"]) {
        const { messages } = events["messages.upsert"];

        if (this.#logMessages) console.log("msg upsert", messages);

        for (const msg of messages) {
          const { key, message } = msg;

          if (!message || this.#getText(key, message).includes(this.#emptyChar)) {
            continue;
          }

          await this.#handleMessage(key, message);
        }
      }
    });

    // Check Freshdesk Replies Every 2 Minutes
    setInterval(async () => {
       // Better to use environment variable
      await this.#helpDesk.checkFreshdeskReplies(this.#socket);
    },  20 * 1000); //10 sec
  }

  async #restart() {
    await this.connect();
    await this.run();
  }

  #getMessageFromStore = (key) => {
    const { id } = key;
    if (this.#messageStore[id]) return this.#messageStore[id].message;
  };

  #getText(key, message) {
    try {
      let text = message.conversation ||
          message.extendedTextMessage?.text ||
          message?.imageMessage?.caption ||
          message?.videoMessage?.caption ||
          "";

      if (key.participant) {
        const me = key.participant.slice(0, 12);
        text = text.replace(/\@me\b/g, `@${me}`);
      }

      return text;
    } catch (err) {
      console.error("Error getting text:", err);
      return "";
    }
  }

  #sendMessage = async (jid, content, ...args) => {
    try {
      if (!this.#selfReply) content.text = content.text + this.#emptyChar;

      const sent = await this.#socket.sendMessage(jid, content, ...args);
      this.#messageStore[sent.key.id] = sent;
      return sent;
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  async #handleMessage(key, message) {
    const jid = key.remoteJid;
    const sender = key.participant || jid;
    const text = this.#getText(key, message);

    // Handle messages starting with !ask using HelpDesk
    if (text.startsWith("!ask")) {
      await this.#helpDesk.handleMessage(this.#socket, {
        message,
        getText: () => text.slice(5).trim() // Remove !ask prefix
      }, sender, jid);
    }
  }
}

module.exports = Bot;