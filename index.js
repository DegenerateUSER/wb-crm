console.log("starting...");
const Bot = require("./Bot");


const { botConfig, pluginsConfig } = require("./config");



const plugins = [


];

const bot = new Bot(plugins, botConfig);

(async () => {
    await bot.connect().then(() => bot.run());

})();