module.exports = {
    name: 'pause',
    description: 'Pause/unpause the current song.',
    async execute(msg, args, vixen) {
        vixen.audioController.pause(msg.guild.id) ? await msg.channel.send('Paused') : await msg.channel.send('Resumed');
    }
};