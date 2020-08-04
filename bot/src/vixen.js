const AudioController = require('./audiocontroller');
const chalk = require('chalk');
const Discord = require('discord.js');
const fs = require('fs-extra');
const logger = require('loglevel');
const moment = require('moment');
const ora = require('ora');
const path = require('path');
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
    constructor(mongo, root) {
        this.db = mongo.db('vixen');
        this.mongoClient = mongo;
        this.rootDir = root;
        this.config = {
            token: '',
            prefix: '/',
            owner: ''
        };
        this.start();
    }
    
    async getEmoji(guild, emojiName) {
        const guilds = this.db.collection('guilds');
        const guildData = await guilds.findOne({
            id: guild.id
        });
        const guildEmojis = new Map(Object.entries(guildData.emojis));
        return guild.emojis.cache.get(guildEmojis.get(emojiName));
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

    async start() {
        this.log('Starting Vixen');
        const vixenData = this.db.collection('botvars');
        const token = (await vixenData.findOne({name: 'token'}));
        const owner = (await vixenData.findOne({name: 'owner'}));
        if (!token) {
            this.log(`Discord token has not been set! Please run ${chalk.green('yarn setup')} from the Vixen root directory!`, 'error');
            return process.exit(1);
        }
        if (!owner || !owner.value || owner.value === '') this.log('Bot owner ID not set!', 'warn');
        this.config.token = token.value;
        this.config.owner = owner ? owner.value : '';
        this.bot = new Discord.Client();

        // Register commands
        this.bot.commands = new Discord.Collection();
        this.bot.commandGroups = {
            fun: 'Fun commands or just-for-the-heck-of-it commands',
            moderation: 'Commands related to guild moderation',
            music: 'Commands related to controlling the audio player'
        };
        const cmdFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
        cmdFiles.forEach(file => {
            const command = require(`./commands/${file}`);
            this.bot.commands.set(command.name, command);
        });

        Object.keys(this.bot.commandGroups).forEach(group => {
            const groupCmds = fs.readdirSync(path.join(__dirname, 'commands', group)).filter(file => file.endsWith('.js'));
            groupCmds.forEach(file => {
                const command = require(`./commands/${group}/${file}`);
                this.bot.commands.set(command.name, command);
            });
        });

        this.bot.once('ready', async () => {
            const WebUI = require('./webui');
            this.webui = new WebUI(this);
            this.audioController = new AudioController(this);
            this.log('Logged into Discord', 'info');
            this.bot.guilds.cache.forEach(async (guild) => {
                fs.ensureDirSync(`./data/${guild.id}`);
                const guilds = this.db.collection('guilds');
                await guilds.updateOne({
                    id: guild.id
                }, {
                    $set: {
                        id: guild.id,
                        name: guild.name
                    }
                }, {
                    upsert: true
                });
                const guildData = await guilds.findOne({
                    id: guild.id
                });
                const emojis = guildData.emojis ? new Map(Object.entries(guildData.emojis)) : new Map();
                let emoji = emojis.get('loading');
                if (!emoji) {
                    this.log(`Loading emoji is incorrect or does not exist on guild ${guild.id}. Creating it...`, 'warn');
                    let newEmoji = await guild.emojis.create(path.join(this.rootDir, 'assets/loading.gif'), 'vixenload');
                    const existingEmojiMap = (await guilds.findOne({
                        id: guild.id
                    })).emojis;
                    const emojiMap = existingEmojiMap ? existingEmojiMap : new Map();
                    emojiMap.set('loading', newEmoji.id);
                    await guilds.updateOne({
                        id: guild.id
                    }, {
                        $set: {
                            emojis: emojiMap
                        }
                    });
                }
            });
            this.log('Vixen startup complete');
        });

        this.bot.on('channelCreate', async channel => {
            if (channel.type === 'dm') return;
            const collection = this.db.collection('guilds');
            const query = await collection.findOne({
                id: channel.guild.id
            }).roles.get('muted');
            if (query) {
                const muteRole = query;
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
            if (this.bot.commands.get(command).modOnly && !isUserModerator(msg.member)) return msg.reply('You need to be a moderator to use that command.');
            if (this.bot.commands.get(command).adminOnly && !isUserAdmin(msg.member)) return msg.reply('You need to have the \'Administrator\' permission to use that command.');
            if (this.bot.commands.get(command).ownerOnly && !isUserOwner(msg.member)) return msg.reply('Only the server owner may use that command.');
            if (this.bot.commands.get(command).masterOnly && !isUserMaster(msg.author.id, this.config.owner)) return msg.reply('Only the bot owner may use that command.');
            try {
                this.bot.commands.get(command).execute(msg, args, this);
            } catch (error) {
                this.log(error, 'error');
                msg.reply('An error ocurred executing that command, please check the log for details.');
            }
        });

        this.bot.setInterval(async () => {
            const guilds = await this.db.collection('guilds').find({});
            guilds.forEach(server => {
                if (server.mutedUsers) {
                    const muted = new Map(Object.entries(server.mutedUsers));
                    if (muted.size > 0) {
                        this.log(`${server.id} contains ${muted.size} muted users, checking for expired mutes`, 'debug');
                        muted.forEach(async (person, id) => {
                            if (moment.unix(person.endTime).isBefore(moment())) {
                                this.log(`${id}'s mute on ${server.id} has expired. Unmuting.`);
                                const guild = this.bot.guilds.resolve(server.id);
                                const muteRole = (await this.db.collection('guilds').findOne({
                                    id: guild.id
                                })).roles.muted;
                                guild.member(id).roles.remove(muteRole, 'User mute time expired.');
                                guild.member(id).user.send(`You are no longer muted on ${guild.name}. Remember to follow the rules!`);
                                const newMuted = new Map(Object.entries(server.mutedUsers));
                                newMuted.delete(id);
                                await this.db.collection('guilds').updateOne({id: guild.id}, {
                                    $set: {
                                        mutedUsers: newMuted
                                    }
                                });
                            }
                        });
                    }
                }
            });
        }, 5000);

        // Graceful exit
        const death = require('death');
        death(async () => {
            console.log('');
            this.log('Shutting down Vixen...');
            await this.mongoClient.close();
            this.log('Closed DB connection');
            await this.webui.stop();
            this.log('Stopped OAuth Provider');
            await this.bot.destroy();
            this.log('Disconnected from Discord');
            await this.later(1500);
            this.log('Vixen has been shut down');
            console.log('');
            process.exit(0);
        });

        this.bot.login(this.config.token);
    }

    exit() {
        process.exit(0);
    }
}

function isUserModerator(user) {
    return user.hasPermission('KICK_MEMBERS') || user.hasPermission('BAN_MEMBERS') || isUserOwner(user);
}

function isUserAdmin(user) {
    return user.hasPermission('ADMINISTRATOR') || isUserOwner(user);
}

function isUserOwner(user) {
    return user.guild.owner === user;
}

function isUserMaster(userId, vixenOwner) {
    return userId === vixenOwner;
}

module.exports = Vixen;