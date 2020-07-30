module.exports = {
    name: 'skip',
    description: 'Skip the current song.',
    execute(msg, args, vixen) {
        vixen.audioController.skip(msg.guild.id);
    }
};