const dur = require('format-duration');

module.exports = {
    name: 'queue',
    description: 'Queue management',
    async execute(msg, args, vixen) {
        let controller = vixen.audioController;

        if (args.length < 1) {
            // Print queue to Discord
            let {table} = require('table');
            let queue = controller.getQueue(msg.guild.id).slice();
            let messageString;
            let data = [['Pos', 'Title', 'Duration', 'Requester', 'ETA']];
            let timeTil = controller.getTimeTilNext(msg.guild.id);
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
                        alignment: 'center'
                    },
                    3: {
                        alignment: 'center'
                    },
                    4: {
                        alignment: 'center'
                    }
                },
                drawHorizontalLine: (index) => {
                    return index === 1;
                }
            };
            let page = 1;
            let index = 1;
            queue.forEach(video => {
                data.push([index, video.title, dur(video.duration*1000), video.requester.displayName, dur(timeTil)]);
                index++;
                if (`Queue page ${page}\`\`\`${table(data, tableCfg)}\`\`\``.length >= 2000) {
                    let overflow = data.pop();
                    msg.channel.send(`Queue page ${page}\`\`\`${table(data, tableCfg)}\`\`\``);
                    page++;
                    data = [['Pos', 'Title', 'Duration', 'Requester', 'ETA'], overflow];
                }
                timeTil += video.duration*1000;
            });
            messageString = table(data, tableCfg);
            await msg.channel.send(`Queue page ${page}\`\`\`${messageString}\`\`\``);
            await msg.channel.send(`Summary: ${index-1} items in queue. Queue finished in ${dur(timeTil)}`);
        }

    }
};