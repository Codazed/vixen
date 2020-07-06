module.exports = {
    name: 'loop',
    description: 'Loop the current song.',
    execute(msg, args, vixen) {
        vixen.audioController.toggleLoop(msg.guild.id);
    }
};