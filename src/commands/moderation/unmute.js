module.exports = {
    name: 'unmute',
    description: 'Unmute a muted user',
    async execute(msg, args, vixen) {
        if (args[0]) {
            const user = msg.guild.member(args[0].replace(/[^A-Za-z0-9]/g, ''));
            const muted = vixen.db.prepare(`SELECT * FROM muted WHERE id=? AND guild=?`).get(user.id, msg.guild.id);
            let nick = '';
            if (user.nickname !== null) nick = `Nickname: ${user.nickname}, `;
            if (muted) {
                const query = vixen.db.prepare(`SELECT * FROM '${msg.guild.id}' WHERE id='muteRole'`).get();
                const muteRole = query.value;
                await user.roles.remove(muteRole, `Manually unmuted by ${msg.author.tag}`);
                vixen.db.prepare(`delete from muted where id=? and guild=?`).run(user.id, msg.guild.id);
                try {
                    await user.user.send(`You are no longer muted on ${user.guild.name}. Remember to follow the rules!`);
                } catch {
                    vixen.log('Unable to send DM to ' + user.user.tag, 'WARN');
                }
                await msg.channel.send(`User \`${user.user.tag} (${nick}ID: ${user.id})\` manually unmuted.`);
            } else {
                await msg.channel.send(`User \`${user.user.tag} (${nick}ID: ${user.id})\` is not muted.`);

            }
        }
    }
};