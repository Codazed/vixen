const AudioController = require('./audiocontroller');
const chalk = require('chalk');
const Discord = require('discord.js');
const fs = require('fs-extra');
const logger = require('loglevel');
const moment = require('moment');
const ora = require('ora');
const prefix = require('loglevel-plugin-prefix');

const colors = {
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red
};

prefix.reg(logger);
logger.enableAll();
prefix.apply(logger, {
    format(level, name, timestamp) {
        return `${chalk.gray(`[${timestamp}]`)} ${colors[level.toUpperCase()](level + ':')}`;
    }
});

class Vixen {
    constructor(db) {
        this.db = db;
        this.config = {
            token: '',
            prefix: '',
            owner: ''
        };
        this.start();
    }

    getEmoji(guild, emojiName) {
        return guild.emojis.cache.get(this.db.prepare(`SELECT * FROM '${guild.id}' WHERE id=?`).get(`${emojiName}Emoji`).value);
    }

    later(delay) {
        return new Promise(resolve => {
            setTimeout(resolve, delay);
        });
    }

    log(message, loglevel = 'info') {
        switch (loglevel.toLowerCase()) {
        case 'debug':
            logger.debug(message);
            break;
        case 'info':
            logger.info(message);
            break;
        case 'warn':
            logger.warn(message);
            break;
        case 'error':
            logger.error(message);
            break;
        }
    }

    start() {
        const spinner = ora('Starting bot').start();

        const fetch = this.db.prepare('SELECT * FROM vixen WHERE id=?');
        this.config.token = fetch.get('disc_token').value;
        this.config.prefix = fetch.get('prefix').value;
        this.config.owner = fetch.get('owner').value;

        this.bot = new Discord.Client();
        this.bot.commands = new Discord.Collection();
        const cmdFiles = fs.readdirSync('./src/commands').filter(file => file.endsWith('.js'));
        cmdFiles.forEach(file => {
            const command = require(`./commands/${file}`);
            this.bot.commands.set(command.name, command);
        });

        this.bot.once('ready', async() => {
            this.audioController = new AudioController(this);
            spinner.stop();
            this.log('Logged in', 'info');
            this.bot.guilds.cache.forEach(async (guild) => {
                fs.ensureDirSync(`./data/${guild.id}`);
                this.db.prepare(`CREATE TABLE IF NOT EXISTS '${guild.id}' (id text, value text)`).run();
                this.db.prepare('CREATE TABLE IF NOT EXISTS muted (id text, name text, guild text, guildName text, muteTimeStart text, muteTimeEnd text)').run();
                const info = this.db.prepare('SELECT * FROM guilds WHERE uid=?').get(guild.id);
                if (!info) this.db.prepare('INSERT INTO guilds (uid, name) VALUES (?, ?)').run(guild.id, guild.name);
                const emoji = this.db.prepare(`SELECT * FROM '${guild.id}' WHERE id=?`).get('loadingEmoji');
                if (!emoji) {
                    this.log(`Loading emoji is incorrect or does not exist on guild ${guild.id}. Creating it...`, 'warn');
                    let newEmoji = await guild.emojis.create('./assets/loading.gif', 'vixenload');
                    this.db.prepare(`INSERT INTO '${guild.id}' (id, value) VALUES ('loadingEmoji', ?)`).run(newEmoji.id);
                }
            });
        });

        this.bot.on('channelCreate', channel => {
            if (channel.type === 'dm') return;
            const query = this.db.prepare(`SELECT * FROM '${channel.guild.id}' WHERE id=?`).get('muteRole');
            if (query) {
                const muteRole = query.value;
                channel.updateOverwrite(muteRole, {
                    ADD_REACTIONS: false,
                    SEND_MESSAGES: false,
                    CONNECT: false,
                    SPEAK: false
                });
            }
        });

        this.bot.on('message', msg => {
            const prefix = this.config.prefix;
            if (msg.mentions.users.has(this.bot.user.id)) {
                msg.react(require('random-item')(['😄', '🤗', '😊', '🙃', '🦊']));
            }
            if (!msg.content.startsWith(prefix) || msg.author.bot) return;

            const args = msg.content.slice(prefix.length).split(/ +/);
            const command = args.shift().toLowerCase();

            if (!this.bot.commands.has(command)) return;
            try {
                this.bot.commands.get(command).execute(msg, args, this);
            } catch (error) {
                this.log(error, 'error');
                msg.reply('An error ocurred executing that command, please check the log for details.');
            }
        });

        this.bot.setInterval(() => {
            const muted = this.db.prepare(`SELECT * FROM muted`).all();
            muted.forEach(person => {
                if (moment.unix(person.muteTimeEnd).isBefore(moment())) {
                    const guild = this.bot.guilds.resolve(person.guild);
                    const muteRole = this.db.prepare(`SELECT * FROM '${guild.id}' WHERE id=?`).get('muteRole').value;
                    guild.member(person.id).roles.remove(muteRole, 'User mute time expired.');
                    guild.member(person.id).user.send(`You are no longer muted on ${guild.name}. Remember to follow the rules!`);
                    this.db.prepare('DELETE FROM muted WHERE id=? AND guild=?').run(person.id, guild.id);
                }
            });
        }, 5000);

        // Graceful exit
        const death = require('death');
        death(async() => {
            const destroySpinner = ora('Shutting down gracefully...').start();
            await this.bot.destroy();
            await this.later(1500);
            destroySpinner.stop();
            process.exit(0);
        });

        this.bot.login(this.config.token);
    }

    exit() {
        process.exit(0);
    }
}

module.exports = Vixen;