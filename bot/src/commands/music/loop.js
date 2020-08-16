module.exports = {
  name: 'loop',
  description: 'Loop the current song.',
  async execute(msg, args, vixen) {
        vixen.audioController.toggleLoop(msg.guild.id) ? await msg.channel.send('Loop enabled') : await msg.channel.send('Loop disabled');
  },
};
