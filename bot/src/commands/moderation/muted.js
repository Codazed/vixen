const moment = require('moment');
const {table} = require('table');

module.exports = {
  name: 'muted',
  description: 'Shows a table of the muted users in the current guild',
  modOnly: true,
  async execute(msg, args, vixen) {
    const collection = vixen.db.collection('guilds');
    const guildData = await collection.findOne({id: msg.guild.id});
    const muted = new Map(Object.entries(guildData.mutedUsers));
    let messageString;
    let data = [['Discord Tag', 'ID', 'Muted On', 'Muted For', 'Muted Until']];
    const tableCfg = {
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
        joinJoin: `┼`,
      },
      columns: {
        0: {
          alignment: 'left',
        },
        1: {
          alignment: 'left',
        },
        2: {
          alignment: 'left',
        },
        3: {
          alignment: 'left',
        },
        4: {
          alignment: 'left',
        },
      },
      drawHorizontalLine: (index) => {
        return index === 1;
      },
    };
    let page = 1;
    if (muted.size <= 0) return await msg.channel.send('There are no muted users on this server.');
    muted.forEach((person, id) => {
      const member = msg.guild.member(id);
      data.push([member.user.tag, id, moment.unix(person.startTime).utc().format('DD/MM/YYYY HH:mm [UTC]'), moment.duration(moment.unix(person.endTime).diff(moment.unix(person.startTime))).humanize(), moment.unix(person.endTime).utc().format('DD/MM/YYYY HH:mm [UTC]')]);
      if (`Muted users page ${page}\`\`\`${table(data, tableCfg)}\`\`\``.length >= 2000) {
        const overflow = data.pop();
        msg.channel.send(`Muted users page ${page}\`\`\`${table(data, tableCfg)}\`\`\``);
        page++;
        data = [['Discord Tag', 'ID', 'Muted On', 'Muted For', 'Muted Until'], overflow];
      }
    });
    messageString = table(data, tableCfg);
    await msg.channel.send(`Muted users page ${page}\`\`\`${messageString}\`\`\``);
  },
};
