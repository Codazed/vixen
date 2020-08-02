const download = require('download');
const fs = require('fs-extra');
const musicMeta = require('music-metadata');
const ora = require('ora');

module.exports = {
    name: 'play',
    description: 'Play music',
    async execute(msg, args, vixen) {
        const controller = vixen.audioController;
        if (!msg.member.voice.channel) {
            await msg.reply('You need to be in a voice channel to do that.');
        } else if (msg.attachments.size > 0) {
            const attachment = msg.attachments.first();
            let regex = /(.mp3|.wav|.ogg|.flac)$/g;
            if (regex.test(attachment.name)) {
                const loadingEmoji = await vixen.getEmoji(msg.guild, 'loading');
                const loadMsg = await msg.channel.send(`${loadingEmoji} Downloading uploaded audio...`);
                const downloadSpinner = ora(`Downloading '${attachment.url}'...`).start();
                await download(attachment.url, './cache');
                const metadata = await musicMeta.parseFile(`./cache/${attachment.name}`);
                downloadSpinner.stop();
                loadMsg.delete();
                let data = {
                    query: 'file',
                    title: metadata.common.title,
                    uploader: metadata.common.artist,
                    url: attachment.url,
                    filename: attachment.name,
                    thumbnail: null,
                    duration: metadata.format.duration,
                    source: 'File',
                    vc: msg.member.voice.channel,
                    channel: msg.channel,
                    requester: msg.member
                };
                controller.play(msg.guild.id, data);
            } else {
                await msg.channel.send('Sorry, I can only play mp3, wav, flac, and ogg files right now.');
            }
        } else {
            const query = args.toString().replace(/,/g, ' ');
            const loadingEmoji = await vixen.getEmoji(msg.guild, 'loading');
            const loadMsg = await msg.channel.send(`${loadingEmoji} Fetching info for query \`${query}\``);
            controller.getVideoInfo(query).then(async data => {
                const newData = data;
                newData.vc = msg.member.voice.channel;
                newData.channel = msg.channel;
                newData.requester = msg.member;
                loadMsg.edit(`${loadingEmoji} Downloading '${newData.title}'`);
                if (fs.existsSync(`./cache/${newData.id}.ogg`)) {
                    loadMsg.delete();
                    controller.play(msg.guild.id, newData);
                } else {
                    await controller.download(newData);
                    loadMsg.delete();
                    controller.play(msg.guild.id, newData);
                }
            }).catch(error => {
                vixen.log(error, 'error');
            });

        }
    }
};