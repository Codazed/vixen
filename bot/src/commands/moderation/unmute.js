module.exports = {
    name: 'unmute',
    description: 'Unmute a muted user',
    modOnly: true,
    async execute(msg, args, vixen) {
        if (args[0]) {
            const collection = vixen.db.collection('guilds');
            const guildData = await collection.findOne({id: msg.guild.id});
            const user = msg.guild.member(args[0].replace(/[^A-Za-z0-9]/g, ''));
            // const muted = vixen.db.prepare(`SELECT * FROM muted WHERE id=? AND guild=?`).get(user.id, msg.guild.id);
            const muted = new Map(Object.entries(guildData.mutedUsers));
            let nick = '';
            if (user.nickname !== null) nick = `Nickname: ${user.nickname}, `;
            if (muted.has(user.id)) {
                // const query = vixen.db.prepare(`SELECT * FROM '${msg.guild.id}' WHERE id='muteRole'`).get();
                const muteRole = await msg.guild.roles.fetch(guildData.roles.muted);
                await user.roles.remove(muteRole, `Manually unmuted by ${msg.author.tag}`);
                muted.delete(user.id);
                // vixen.db.prepare(`delete from muted where id=? and guild=?`).run(user.id, msg.guild.id);
                await collection.updateOne({id: msg.guild.id}, {$set: {mutedUsers: muted}});
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