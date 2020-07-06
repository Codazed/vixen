const moment = require('moment');
const {table} = require('table');

module.exports = {
    name: 'muted',
    description: 'Shows a table of the muted users in the current guild',
    async execute(msg, args, vixen) {
        const muted = vixen.db.prepare(`SELECT * FROM muted WHERE guild=?`).all(msg.guild.id);
        let messageString;
        let data = [['Discord Tag', 'ID', 'Muted On', 'Muted For', 'Muted Until']];
        let tableCfg = {
            border: {
                topBody: ``,
                topJoin: ``,
                topLeft: ``,
                topRight: ``,

                bottomBody: ``,
                bottomJoin: ``,
                bottomLeft: ``,
                bottomRight: ``,

                bodyLeft: ``,
                bodyRight: ``,
                bodyJoin: `|`,

                joinBody: `─`,
                joinLeft: ``,
                joinRight: ``,
                joinJoin: `┼`
            },
            columns: {
                0: {
                    alignment: 'left'
                },
                1: {
                    alignment: 'left'
                },
                2: {
                    alignment: 'left'
                },
                3: {
                    alignment: 'left'
                },
                4: {
                    alignment: 'left'
                }
            },
            drawHorizontalLine: (index) => {
                return index === 1;
            }
        };
        let page = 1;
        if (muted.length > 0) {
            muted.forEach(person => {
                let member = msg.guild.member(person.id);
                data.push([member.user.tag, person.id, moment.unix(person.muteTimeStart).utc().format('DD/MM/YYYY HH:mm [UTC]'), moment.duration(moment.unix(person.muteTimeEnd).diff(moment.unix(person.muteTimeStart))).humanize(), moment.unix(person.muteTimeEnd).utc().format('DD/MM/YYYY HH:mm [UTC]')]);
                if (`Muted users page ${page}\`\`\`${table(data, tableCfg)}\`\`\``.length >= 2000) {
                    let overflow = data.pop();
                    msg.channel.send(`Muted users page ${page}\`\`\`${table(data, tableCfg)}\`\`\``);
                    page++;
                    data = [['Discord Tag', 'ID', 'Muted On', 'Muted For', 'Muted Until'], overflow];
                }
            });
            messageString = table(data, tableCfg);
            await msg.channel.send(`Muted users page ${page}\`\`\`${messageString}\`\`\``);
        } else {
            await msg.channel.send('There are no muted users on this server.');
        }

    }
};