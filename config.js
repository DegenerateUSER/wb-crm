// Contains the default configuration for Bot & Plugins
// Any attribute not given in the configuration will take its default value

const botConfig = {
    authFolder: "auth",
    selfReply: false,
    logMessages: true,
    llmApiUrl: "http://127.0.0.1:5000"

  };
  
  const pluginsConfig = {
    tagEveryone: {
      membersLimit: 1000,
      trigger: "TagAll",
    },
      helpdesk:{
          freshdeskApiKey: 'YD2wjGoH5Iu2XbR1WtC',
          freshdeskDomain: 'brsgsc',
      },
    warner:{
      membersLimit: 1000,
      trigger: "chat.whatsapp"
    },
      jobs: {
          membersLimit: 1000, // Limit for the number of members
          trigger: "jobs", // Trigger command for manual execution
          groupJid: "120363366629931445@g.us", // Target group JID
          jsonFilePath: "./dwata.json", // Path to the JSON file
      },
      chanel: {
          membersLimit: 1000,
          trigger: "job",
          channelJid: "120363328396555346@newsletter",
          //scheduleTime: "10 16 * * *",

      },
    help: {
        membersLimit: 1000,
        trigger: "help",
      },
      Add: {
          membersLimit: 1000,
          trigger: "MassAdd",
      },
      heck: {
          membersLimit: 1000,
          trigger: "heck",
      },
      onlyme:{
          membersLimit: 1000,
          trigger: "chat.whatsapp"
      },
  };
  
  module.exports = { botConfig, pluginsConfig };