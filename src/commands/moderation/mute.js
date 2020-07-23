const moment = require('moment');

const timeTypes = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'];

module.exports = {
    name: 'mute',
    description: 'Mute a user',
    async execute(msg, args, vixen) {
        const query = vixen.db.prepare(`SELECT * FROM '${msg.guild.id}' WHERE id=?`).get('muteRole');
        let muteRole;
        if (query) {
            muteRole = query.value;
        } else {
            muteRole = await msg.guild.roles.create({
                data: {
                    name: 'Muted',
                    color: 'GREY',
                    mentionable: false
                },
                reason: 'Muted role is required for use of the mute command'
            });
            vixen.db.prepare(`INSERT INTO '${msg.guild.id}' (id, value) VALUES ('muteRole', ?)`).run(muteRole.id);
            msg.guild.channels.cache.forEach(channel => {
                channel.updateOverwrite(muteRole, {
                    ADD_REACTIONS: false,
                    SEND_MESSAGES: false,
                    CONNECT: false,
                    SPEAK: false
                });
            });
        }
        if (args[0] && args[1] && timeTypes.includes(args[2])) {
            const user = msg.guild.member(args[0].replace(/[^A-Za-z0-9]/g, ''));
            const timeAmount = args[1];
            const timeType = args[2];

            const currentTime = moment();
            const muteEndTime = moment().add(timeAmount, timeType);
            if (user === null) {
                await msg.channel.send(`That user isn't a member of this server, or the command syntax is incorrect. The correct syntax is \`${vixen.config.prefix}mute <@user or user id> <amount of time> <seconds, minutes, hours, etc.>\``);
            } else {
                const muted = vixen.db.prepare(`SELECT * FROM muted WHERE id=? AND guild=?`).get(user.id, msg.guild.id);
                let nick = '';
                if (user.nickname !== null) nick = `Nickname: ${user.nickname}, `;
                if (muted) {
                    await msg.channel.send(`User \`${user.user.tag} (${nick}ID: ${user.id})\` is already muted. The mute will expire ${moment.unix(muted.muteTimeEnd).fromNow()}.`);
                } else {
                    const query = vixen.db.prepare(`INSERT INTO muted (id, name, guild, guildName, muteTimeStart, muteTimeEnd) VALUES (?, ?, ?, ?, ?, ?)`);
                    query.run(user.id, user.user.username, msg.guild.id, msg.guild.name, currentTime.unix(), muteEndTime.unix());
                    await msg.channel.send(`Muted user \`${user.user.tag} (${nick}ID: ${user.id})\` until ${moment.unix(muteEndTime.unix()).calendar()}.`);
                    try {
                        await user.user.send(`Whoop! Someone didn't follow the rules on ${user.guild.name}! You have been muted on it until ${moment.unix(muteEndTime.unix()).format('DD/MM/YYYY HH:mm [UTC]')}`);
                    } catch {
                        vixen.log('Unable to send DM to ' + user.user.tag, 'WARN');
                    }
                    await user.roles.add(muteRole);
                    await user.voice.kick('User has been muted.');
                }
            }
        }
    }
};